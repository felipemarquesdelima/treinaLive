import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executors;

public class App {
    private static final int PORT = configuredPort();
    private static final Path PUBLIC_DIR = Paths.get("public").toAbsolutePath().normalize();
    private static final Path UPLOAD_DIR = Paths.get("uploads").toAbsolutePath().normalize();
    private static final Path RECORDINGS_FILE = UPLOAD_DIR.resolve("recordings.tsv").toAbsolutePath().normalize();
    private static final Path MATERIALS_FILE = UPLOAD_DIR.resolve("materials.tsv").toAbsolutePath().normalize();
    private static final Map<String, Room> ROOMS = new HashMap<>();
    private static final Map<String, UserAccount> USERS = new LinkedHashMap<>();
    private static final Map<String, UserAccount> TOKENS = new HashMap<>();
    private static final long PARTICIPANT_TIMEOUT_MILLIS = 45_000;
    private static final long POLL_WAIT_MILLIS = 25_000;

    public static void main(String[] args) throws Exception {
        Files.createDirectories(UPLOAD_DIR);
        seedUsers();

        HttpServer server = HttpServer.create(new InetSocketAddress(PORT), 0);
        server.createContext("/api/auth/login", new LoginHandler());
        server.createContext("/api/auth/me", new MeHandler());
        server.createContext("/api/auth/logout", new LogoutHandler());
        server.createContext("/api/users", new UsersHandler());
        server.createContext("/api/lessons", new LessonsHandler());
        server.createContext("/api/materials", new MaterialsHandler());
        server.createContext("/api/rooms", new RoomsHandler());
        server.createContext("/api/session/join", new JoinHandler());
        server.createContext("/api/session/poll", new PollHandler());
        server.createContext("/api/session/signal", new SignalHandler());
        server.createContext("/api/session/leave", new LeaveHandler());
        server.createContext("/api/upload", new UploadHandler());
        server.createContext("/download", new DownloadHandler());
        server.createContext("/", new StaticHandler());
        server.setExecutor(Executors.newCachedThreadPool());
        server.start();

        System.out.println("Plataforma de treinamentos online iniciada em http://localhost:" + PORT);
        System.out.println("Uploads ficam em: " + UPLOAD_DIR);
    }

    private static class LoginHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendJson(exchange, 405, "{\"error\":\"Metodo nao permitido\"}");
                return;
            }

            Map<String, String> body = parseSimpleJson(readBody(exchange));
            String username = cleanUsername(body.getOrDefault("username", ""));
            String password = body.getOrDefault("password", "");
            UserAccount account;

            synchronized (USERS) {
                account = USERS.get(username);
            }

            if (account == null || !account.active || !account.password.equals(password)) {
                sendJson(exchange, 401, "{\"error\":\"Usuario ou senha invalidos\"}");
                return;
            }

            String token = UUID.randomUUID().toString();
            synchronized (TOKENS) {
                TOKENS.put(token, account);
            }

            exchange.getResponseHeaders().add("Set-Cookie", "treinalive_token=" + token + "; Path=/; SameSite=Lax");
            sendJson(exchange, 200, "{\"token\":\"" + escapeJson(token) + "\",\"user\":" + userJson(account) + "}");
        }
    }

    private static class MeHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            UserAccount account = requireAuth(exchange);
            if (account == null) {
                return;
            }
            sendJson(exchange, 200, "{\"user\":" + userJson(account) + "}");
        }
    }

    private static class LogoutHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            String token = authToken(exchange);
            if (!token.isBlank()) {
                synchronized (TOKENS) {
                    TOKENS.remove(token);
                }
            }
            exchange.getResponseHeaders().add("Set-Cookie", "treinalive_token=; Path=/; Max-Age=0; SameSite=Lax");
            sendJson(exchange, 200, "{\"ok\":true}");
        }
    }

    private static class UsersHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            UserAccount current = requireAuth(exchange);
            if (current == null) {
                return;
            }

            if ("GET".equalsIgnoreCase(exchange.getRequestMethod())) {
                if (!isManager(current)) {
                    sendJson(exchange, 403, "{\"error\":\"Acesso restrito\"}");
                    return;
                }
                sendJson(exchange, 200, usersJson());
                return;
            }

            if ("POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                if (!isManager(current)) {
                    sendJson(exchange, 403, "{\"error\":\"Acesso restrito\"}");
                    return;
                }

                Map<String, String> body = parseSimpleJson(readBody(exchange));
                String username = cleanUsername(body.getOrDefault("username", ""));
                String password = body.getOrDefault("password", "");
                String name = limit(body.getOrDefault("name", username), 60);
                String company = limit(body.getOrDefault("company", current.company), 60);
                String role = normalizeAccountRole(body.getOrDefault("role", "aluno"));

                if (username.isBlank() || password.isBlank()) {
                    sendJson(exchange, 400, "{\"error\":\"Usuario e senha sao obrigatorios\"}");
                    return;
                }
                if (!"mestre".equals(current.role) && !"aluno".equals(role)) {
                    sendJson(exchange, 403, "{\"error\":\"Administrador so pode criar alunos\"}");
                    return;
                }

                UserAccount account = new UserAccount(username, password, name, role, company, true);
                synchronized (USERS) {
                    if (USERS.containsKey(username)) {
                        sendJson(exchange, 409, "{\"error\":\"Usuario ja existe\"}");
                        return;
                    }
                    USERS.put(username, account);
                }
                sendJson(exchange, 201, userJson(account));
                return;
            }

            if ("DELETE".equalsIgnoreCase(exchange.getRequestMethod())) {
                if (!"mestre".equals(current.role)) {
                    sendJson(exchange, 403, "{\"error\":\"Apenas mestre pode remover usuarios\"}");
                    return;
                }
                Map<String, String> query = parseQuery(exchange.getRequestURI().getRawQuery());
                String username = cleanUsername(query.getOrDefault("username", ""));
                if (username.equals(current.username)) {
                    sendJson(exchange, 400, "{\"error\":\"Nao remova a propria conta mestre\"}");
                    return;
                }
                synchronized (USERS) {
                    USERS.remove(username);
                }
                synchronized (TOKENS) {
                    TOKENS.entrySet().removeIf(entry -> entry.getValue().username.equals(username));
                }
                sendJson(exchange, 200, "{\"ok\":true}");
                return;
            }

            sendJson(exchange, 405, "{\"error\":\"Metodo nao permitido\"}");
        }
    }

    private static class LessonsHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendJson(exchange, 405, "{\"error\":\"Metodo nao permitido\"}");
                return;
            }

            UserAccount account = requireAuth(exchange);
            if (account == null) {
                return;
            }

            Map<String, String> query = parseQuery(exchange.getRequestURI().getRawQuery());
            String title = query.getOrDefault("title", "").trim();

            List<LessonRecording> recordings = loadRecordings();
            List<Material> materials = loadMaterials();

            // Se veio ?title=... -> retorna todos os arquivos relacionados àquela aula
            if (!title.isBlank()) {
                List<LessonRecording> recsFor = new ArrayList<>();
                for (LessonRecording r : recordings) {
                    if (r.title.equals(title)) {
                        recsFor.add(r);
                    }
                }

                List<Material> matsFor = new ArrayList<>();
                for (Material m : materials) {
                    if (m.lessonTitle.equals(title)) {
                        matsFor.add(m);
                    }
                }

                StringBuilder json = new StringBuilder();
                json.append("{");
                json.append("\"title\":\"").append(escapeJson(title)).append("\",");
                json.append("\"recordings\":").append(recordingsJson(recsFor)).append(",");
                json.append("\"materials\":").append(materialsListJson(matsFor));
                json.append("}");
                sendJson(exchange, 200, json.toString());
                return;
            }

            // Sem title: retorna lista de títulos distintos (gravações + materiais)
            LinkedHashMap<String, String> titles = new LinkedHashMap<>();
            for (LessonRecording r : recordings) {
                titles.put(r.title, r.title);
            }
            for (Material m : materials) {
                titles.putIfAbsent(m.lessonTitle, m.lessonTitle);
            }

            StringBuilder json = new StringBuilder("[");
            int idx = 0;
            for (String t : titles.values()) {
                if (idx > 0) json.append(',');
                json.append("{\"title\":\"").append(escapeJson(t)).append("\"}");
                idx++;
            }
            json.append("]");
            sendJson(exchange, 200, json.toString());
        }
    }

    private static class MaterialsHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendJson(exchange, 405, "{\"error\":\"Metodo nao permitido\"}");
                return;
            }

            UserAccount account = requireAuth(exchange);
            if (account == null) {
                return;
            }

            sendJson(exchange, 200, materialsJson(loadDownloadableMaterials()));
        }
    }

    private static class RoomsHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendJson(exchange, 405, "{\"error\":\"Metodo nao permitido\"}");
                return;
            }

            UserAccount account = requireAuth(exchange);
            if (account == null) {
                return;
            }

            sendJson(exchange, 200, roomsJson());
        }
    }

    private static String roomsJson() {
        cleanupStaleRooms();
        StringBuilder json = new StringBuilder("[");
        synchronized (ROOMS) {
            int index = 0;
            for (Map.Entry<String, Room> entry : ROOMS.entrySet()) {
                if (index > 0) {
                    json.append(',');
                }
                Room room = entry.getValue();
                int participantCount;
                synchronized (room) {
                    participantCount = room.participants.size();
                }
                json.append("{")
                        .append("\"id\":\"").append(escapeJson(entry.getKey())).append("\",")
                        .append("\"name\":\"").append(escapeJson(entry.getKey())).append("\",")
                        .append("\"participants\":").append(participantCount).append(',')
                        .append("\"privateRoom\":").append(room.privateRoom)
                        .append("}");
                index++;
            }
        }
        json.append("]");
        return json.toString();
    }

    private static class JoinHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendJson(exchange, 405, "{\"error\":\"Metodo nao permitido\"}");
                return;
            }
            UserAccount account = requireAuth(exchange);
            if (account == null) {
                return;
            }

            Map<String, String> body = parseSimpleJson(readBody(exchange));
            String roomId = cleanToken(body.getOrDefault("room", "sala-principal"));
            boolean privateRoom = "true".equalsIgnoreCase(body.getOrDefault("privateRoom", body.getOrDefault("private", "false")));
            String roomPassword = body.getOrDefault("password", "").trim();
            String name = account.name;
            String role = canHost(account) ? "host" : "student";
            String accountRole = account.role;
            String participantId = UUID.randomUUID().toString();

            Room room;
            List<Participant> peers;
            synchronized (ROOMS) {
                cleanupStaleRoomsLocked(System.currentTimeMillis());
                if (isAccountOnlineLocked(account.username)) {
                    sendJson(exchange, 409, "{\"error\":\"Esta conta ja esta online em uma sala. Saia da outra sessao antes de entrar novamente.\"}");
                    return;
                }

                room = ROOMS.get(roomId);
                if (room == null) {
                    if (!canHost(account)) {
                        sendJson(exchange, 403, "{\"error\":\"Apenas hosts podem criar salas\"}");
                        return;
                    }
                    if (privateRoom && roomPassword.isBlank()) {
                        sendJson(exchange, 400, "{\"error\":\"Informe a senha da sala privada\"}");
                        return;
                    }
                    room = new Room(roomId, privateRoom, privateRoom ? roomPassword : "");
                    ROOMS.put(roomId, room);
                }

                synchronized (room) {
                    if (room.privateRoom && !room.password.equals(roomPassword)) {
                        sendJson(exchange, 403, "{\"error\":\"Senha da sala privada invalida\"}");
                        return;
                    }

                    peers = new ArrayList<>(room.participants.values());
                    Participant participant = new Participant(participantId, account.username, name, role, accountRole);
                    room.participants.put(participantId, participant);
                    room.broadcast(new SignalMessage("peer-joined", participantId, "", participantJson(participant)), participantId);
                    room.notifyAll();
                }
            }

            StringBuilder json = new StringBuilder();
            json.append("{\"id\":\"").append(escapeJson(participantId)).append("\",");
            json.append("\"room\":\"").append(escapeJson(roomId)).append("\",");
            json.append("\"peers\":[");
            for (int i = 0; i < peers.size(); i++) {
                if (i > 0) {
                    json.append(',');
                }
                json.append(participantJson(peers.get(i)));
            }
            json.append("]}");
            sendJson(exchange, 200, json.toString());
        }
    }

    private static class PollHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendJson(exchange, 405, "{\"error\":\"Metodo nao permitido\"}");
                return;
            }
            UserAccount account = requireAuth(exchange);
            if (account == null) {
                return;
            }

            Map<String, String> query = parseQuery(exchange.getRequestURI().getRawQuery());
            String roomId = cleanToken(query.getOrDefault("room", ""));
            String participantId = query.getOrDefault("id", "");
            cleanupStaleRooms();
            Room room;

            synchronized (ROOMS) {
                room = ROOMS.get(roomId);
            }

            if (room == null) {
                sendJson(exchange, 404, "{\"error\":\"Sala nao encontrada\"}");
                return;
            }

            List<SignalMessage> messages = new ArrayList<>();
            synchronized (room) {
                Participant participant = room.participants.get(participantId);
                if (participant == null) {
                    sendJson(exchange, 404, "{\"error\":\"Participante nao encontrado\"}");
                    return;
                }
                if (!participant.username.equals(account.username)) {
                    sendJson(exchange, 403, "{\"error\":\"Participante nao pertence a esta conta\"}");
                    return;
                }

                if (participant.queue.isEmpty()) {
                    participant.touch();
                    try {
                        room.wait(POLL_WAIT_MILLIS);
                    } catch (InterruptedException exception) {
                        Thread.currentThread().interrupt();
                    }
                }
                participant.touch();
                messages.addAll(participant.queue);
                participant.queue.clear();
            }

            sendJson(exchange, 200, messagesJson(messages));
        }
    }

    private static class SignalHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendJson(exchange, 405, "{\"error\":\"Metodo nao permitido\"}");
                return;
            }
            UserAccount account = requireAuth(exchange);
            if (account == null) {
                return;
            }

            Map<String, String> body = parseSimpleJson(readBody(exchange));
            String roomId = cleanToken(body.getOrDefault("room", ""));
            String from = body.getOrDefault("from", "");
            String target = body.getOrDefault("target", "");
            String type = body.getOrDefault("type", "");
            String payload = body.getOrDefault("payload", "");

            Room room;
            synchronized (ROOMS) {
                room = ROOMS.get(roomId);
            }

            if (room == null || type.isBlank() || from.isBlank()) {
                sendJson(exchange, 400, "{\"error\":\"Sinalizacao invalida\"}");
                return;
            }

            synchronized (room) {
                Participant sender = room.participants.get(from);
                if (sender == null) {
                    sendJson(exchange, 404, "{\"error\":\"Remetente nao esta na sala\"}");
                    return;
                }
                if (!sender.username.equals(account.username)) {
                    sendJson(exchange, 403, "{\"error\":\"Remetente nao pertence a esta conta\"}");
                    return;
                }
                sender.touch();

                if (isModerationSignal(type)) {
                    Participant targetParticipant = room.participants.get(target);
                    if (targetParticipant == null) {
                        sendJson(exchange, 404, "{\"error\":\"Participante alvo nao encontrado\"}");
                        return;
                    }
                    if (!canModerate(account, targetParticipant)) {
                        sendJson(exchange, 403, "{\"error\":\"Sem permissao para moderar este participante\"}");
                        return;
                    }
                }

                SignalMessage message = new SignalMessage(type, from, target, payload);
                if (target.isBlank()) {
                    room.broadcast(message, from);
                } else {
                    room.sendTo(target, message);
                }
                room.notifyAll();
            }

            sendJson(exchange, 200, "{\"ok\":true}");
        }
    }

    private static class LeaveHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendJson(exchange, 405, "{\"error\":\"Metodo nao permitido\"}");
                return;
            }
            UserAccount account = requireAuth(exchange);
            if (account == null) {
                return;
            }

            Map<String, String> body = parseSimpleJson(readBody(exchange));
            String roomId = cleanToken(body.getOrDefault("room", ""));
            String participantId = body.getOrDefault("id", "");
            leaveRoom(roomId, participantId, account.username);
            sendJson(exchange, 200, "{\"ok\":true}");
        }
    }

    private static class StaticHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendText(exchange, 405, "Metodo nao permitido");
                return;
            }

            String requestPath = exchange.getRequestURI().getPath();
            if (requestPath.equals("/")) {
                requestPath = "/index.html";
            }

            Path file = PUBLIC_DIR.resolve(requestPath.substring(1)).normalize();
            if (!file.startsWith(PUBLIC_DIR) || !Files.exists(file) || Files.isDirectory(file)) {
                sendText(exchange, 404, "Pagina nao encontrada");
                return;
            }

            Headers headers = exchange.getResponseHeaders();
            headers.set("Content-Type", contentType(file));
            exchange.sendResponseHeaders(200, Files.size(file));
            try (OutputStream body = exchange.getResponseBody()) {
                Files.copy(file, body);
            }
        }
    }

    private static class UploadHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendJson(exchange, 405, "{\"error\":\"Metodo nao permitido\"}");
                return;
            }
            UserAccount account = requireAuth(exchange);
            if (account == null) {
                return;
            }
            if (!canHost(account)) {
                sendJson(exchange, 403, "{\"error\":\"Apenas mestre ou administrador pode enviar arquivos\"}");
                return;
            }

            String contentType = exchange.getRequestHeaders().getFirst("Content-Type");
            if (contentType == null || !contentType.contains("multipart/form-data")) {
                sendJson(exchange, 400, "{\"error\":\"Envie o arquivo como multipart/form-data\"}");
                return;
            }

            String boundary = extractBoundary(contentType);
            if (boundary == null) {
                sendJson(exchange, 400, "{\"error\":\"Boundary ausente\"}");
                return;
            }

            byte[] body = readAll(exchange.getRequestBody());
            MultipartFile upload = parseMultipart(body, boundary);
            if (upload == null || upload.content.length == 0) {
                sendJson(exchange, 400, "{\"error\":\"Nenhum arquivo recebido\"}");
                return;
            }

            String safeName = sanitizeFileName(upload.fileName);
            if (safeName.isBlank()) {
                safeName = "arquivo-" + System.currentTimeMillis();
            }

            Map<String, String> query = parseQuery(exchange.getRequestURI().getRawQuery());
            boolean recordingUpload = "true".equalsIgnoreCase(query.getOrDefault("recording", "false"));
            boolean materialUpload = "true".equalsIgnoreCase(query.getOrDefault("material", "false"));
            if (recordingUpload == materialUpload) {
                sendJson(exchange, 400, "{\"error\":\"Informe se o arquivo e uma gravacao ou um material\"}");
                return;
            }
            if (materialUpload && isVideoFile(safeName, "")) {
                sendJson(exchange, 400, "{\"error\":\"Envie apenas materiais. Grave videos pelo botao Gravar aula\"}");
                return;
            }

            Path destination = uniquePath(UPLOAD_DIR.resolve(safeName).normalize());
            if (!destination.startsWith(UPLOAD_DIR)) {
                sendJson(exchange, 400, "{\"error\":\"Nome de arquivo invalido\"}");
                return;
            }

            Files.write(destination, upload.content);

            if (recordingUpload) {
                String lessonTitle = limit(query.getOrDefault("lessonTitle", "Aula gravada"), 90);
                appendRecording(new LessonRecording(
                        lessonTitle.isBlank() ? "Aula gravada" : lessonTitle,
                        destination.getFileName().toString(),
                        Files.size(destination),
                        Instant.ofEpochMilli(destination.toFile().lastModified()).toString(),
                        Files.probeContentType(destination)
                ));
            } else {
                String lessonTitle = limit(query.getOrDefault("lessonTitle", "Material"), 90);
                appendMaterial(new Material(
                        lessonTitle.isBlank() ? "Material" : lessonTitle,
                        destination.getFileName().toString(),
                        Files.size(destination),
                        Instant.ofEpochMilli(destination.toFile().lastModified()).toString(),
                        Files.probeContentType(destination)
                ));
            }
            sendJson(exchange, 201, "{\"name\":\"" + escapeJson(destination.getFileName().toString()) + "\"}");
        }
    }

    private static class DownloadHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendText(exchange, 405, "Metodo nao permitido");
                return;
            }
            UserAccount account = requireAuth(exchange);
            if (account == null) {
                return;
            }

            Map<String, String> query = parseQuery(exchange.getRequestURI().getRawQuery());
            String name = query.get("name");
            if (name == null || name.isBlank()) {
                sendText(exchange, 400, "Arquivo nao informado");
                return;
            }

            Path file = UPLOAD_DIR.resolve(sanitizeFileName(name)).normalize();
            if (!file.startsWith(UPLOAD_DIR) || !Files.exists(file) || Files.isDirectory(file)) {
                sendText(exchange, 404, "Arquivo nao encontrado");
                return;
            }

            Headers headers = exchange.getResponseHeaders();
            headers.set("Content-Type", "application/octet-stream");
            headers.set("Content-Disposition", "attachment; filename=\"" + file.getFileName() + "\"");
            exchange.sendResponseHeaders(200, Files.size(file));
            try (OutputStream body = exchange.getResponseBody()) {
                Files.copy(file, body);
            }
        }
    }

    private static void seedUsers() {
        synchronized (USERS) {
            if (!USERS.isEmpty()) {
                return;
            }
            USERS.put("mestre", new UserAccount("mestre", "mestre123", "Usuario Mestre", "mestre", "TreinaLive", true));
            USERS.put("admin", new UserAccount("admin", "admin123", "Administrador Empresa", "administrador", "Empresa Demo", true));
            USERS.put("aluno", new UserAccount("aluno", "aluno123", "Aluno Demo", "aluno", "Empresa Demo", true));
        }
    }

    private static UserAccount requireAuth(HttpExchange exchange) throws IOException {
        String token = authToken(exchange);
        UserAccount account;
        synchronized (TOKENS) {
            account = TOKENS.get(token);
        }
        if (account == null || !account.active) {
            sendJson(exchange, 401, "{\"error\":\"Autenticacao obrigatoria\"}");
            return null;
        }
        return account;
    }

    private static String authToken(HttpExchange exchange) {
        String authorization = exchange.getRequestHeaders().getFirst("Authorization");
        if (authorization != null && authorization.startsWith("Bearer ")) {
            return authorization.substring("Bearer ".length()).trim();
        }

        String cookie = exchange.getRequestHeaders().getFirst("Cookie");
        if (cookie != null) {
            for (String item : cookie.split(";")) {
                String trimmed = item.trim();
                if (trimmed.startsWith("treinalive_token=")) {
                    return trimmed.substring("treinalive_token=".length());
                }
            }
        }

        Map<String, String> query = parseQuery(exchange.getRequestURI().getRawQuery());
        return query.getOrDefault("token", "");
    }

    private static boolean canHost(UserAccount account) {
        return "mestre".equals(account.role) || "administrador".equals(account.role);
    }

    private static boolean isModerationSignal(String type) {
        return "force-mute".equals(type) || "kick".equals(type);
    }

    private static boolean canModerate(UserAccount moderator, Participant target) {
        if (!canHost(moderator)) {
            return false;
        }
        return rolePriority(moderator.role) <= rolePriority(target.accountRole);
    }

    private static int rolePriority(String role) {
        return switch (role == null ? "" : role) {
            case "mestre" -> 0;
            case "administrador", "host" -> 1;
            case "aluno", "student" -> 2;
            default -> 3;
        };
    }

    private static boolean isManager(UserAccount account) {
        return canHost(account);
    }

    private static String usersJson() {
        StringBuilder json = new StringBuilder("[");
        synchronized (USERS) {
            int index = 0;
            for (UserAccount account : USERS.values()) {
                if (index > 0) {
                    json.append(',');
                }
                json.append(userJson(account));
                index++;
            }
        }
        json.append(']');
        return json.toString();
    }

    private static String userJson(UserAccount account) {
        return "{"
                + "\"username\":\"" + escapeJson(account.username) + "\","
                + "\"name\":\"" + escapeJson(account.name) + "\","
                + "\"role\":\"" + escapeJson(account.role) + "\","
                + "\"company\":\"" + escapeJson(account.company) + "\","
                + "\"active\":" + account.active
                + "}";
    }

    private static synchronized void appendRecording(LessonRecording recording) throws IOException {
        Files.createDirectories(UPLOAD_DIR);
        String line = escapeTsv(recording.title) + "\t"
                + escapeTsv(recording.fileName) + "\t"
                + recording.size + "\t"
                + escapeTsv(recording.modified) + "\t"
                + escapeTsv(recording.type) + System.lineSeparator();
        Files.writeString(RECORDINGS_FILE, line, StandardCharsets.UTF_8,
                Files.exists(RECORDINGS_FILE)
                        ? java.nio.file.StandardOpenOption.APPEND
                        : java.nio.file.StandardOpenOption.CREATE);
    }

    private static synchronized List<LessonRecording> loadRecordings() throws IOException {
        List<LessonRecording> recordings = new ArrayList<>();
        if (!Files.exists(RECORDINGS_FILE)) {
            return recordings;
        }

        for (String line : Files.readAllLines(RECORDINGS_FILE, StandardCharsets.UTF_8)) {
            String[] parts = line.split("\t", -1);
            if (parts.length < 5) {
                continue;
            }
            Path file = UPLOAD_DIR.resolve(unescapeTsv(parts[1])).normalize();
            if (!file.startsWith(UPLOAD_DIR) || !Files.exists(file)) {
                continue;
            }
            long size = parseLong(parts[2], file.toFile().length());
            recordings.add(new LessonRecording(
                    unescapeTsv(parts[0]),
                    file.getFileName().toString(),
                    size,
                    unescapeTsv(parts[3]),
                    unescapeTsv(parts[4])
            ));
        }
        recordings.sort(Comparator.comparing((LessonRecording item) -> item.modified).reversed());
        return recordings;
    }

    private static String recordingsJson(List<LessonRecording> recordings) {
        StringBuilder json = new StringBuilder("[");
        for (int i = 0; i < recordings.size(); i++) {
            LessonRecording recording = recordings.get(i);
            if (i > 0) {
                json.append(',');
            }
            json.append('{')
                    .append("\"title\":\"").append(escapeJson(recording.title)).append("\",")
                    .append("\"name\":\"").append(escapeJson(recording.fileName)).append("\",")
                    .append("\"size\":").append(recording.size).append(',')
                    .append("\"modified\":\"").append(escapeJson(recording.modified)).append("\",")
                    .append("\"type\":\"").append(escapeJson(recording.type)).append("\"")
                    .append('}');
        }
        json.append(']');
        return json.toString();
    }

    private static synchronized void appendMaterial(Material material) throws IOException {
        Files.createDirectories(UPLOAD_DIR);
        String line = escapeTsv(material.lessonTitle) + "\t"
                + escapeTsv(material.fileName) + "\t"
                + material.size + "\t"
                + escapeTsv(material.uploadedAt) + "\t"
                + escapeTsv(material.type) + System.lineSeparator();
        Files.writeString(MATERIALS_FILE, line, StandardCharsets.UTF_8,
                Files.exists(MATERIALS_FILE)
                        ? java.nio.file.StandardOpenOption.APPEND
                        : java.nio.file.StandardOpenOption.CREATE);
    }

    private static synchronized List<Material> loadMaterials() throws IOException {
        List<Material> materials = new ArrayList<>();
        if (!Files.exists(MATERIALS_FILE)) {
            return materials;
        }

        for (String line : Files.readAllLines(MATERIALS_FILE, StandardCharsets.UTF_8)) {
            String[] parts = line.split("\t", -1);
            if (parts.length < 5) {
                continue;
            }
            Path file = UPLOAD_DIR.resolve(unescapeTsv(parts[1])).normalize();
            if (!file.startsWith(UPLOAD_DIR) || !Files.exists(file)) {
                continue;
            }
            long size = parseLong(parts[2], file.toFile().length());
            materials.add(new Material(
                    unescapeTsv(parts[0]),
                    file.getFileName().toString(),
                    size,
                    unescapeTsv(parts[3]),
                    unescapeTsv(parts[4])
            ));
        }
        materials.sort(Comparator.comparing((Material item) -> item.uploadedAt).reversed());
        return materials;
    }

    private static List<Material> loadDownloadableMaterials() throws IOException {
        Map<String, Material> byFileName = new LinkedHashMap<>();

        for (Material material : loadMaterials()) {
            byFileName.putIfAbsent(material.fileName, material);
        }

        for (LessonRecording recording : loadRecordings()) {
            if (!isVideoFile(recording.fileName, recording.type)) {
                byFileName.putIfAbsent(recording.fileName, new Material(
                        recording.title,
                        recording.fileName,
                        recording.size,
                        recording.modified,
                        recording.type
                ));
            }
        }

        if (Files.exists(UPLOAD_DIR)) {
            List<Path> files = new ArrayList<>();
            try (var stream = Files.list(UPLOAD_DIR)) {
                stream.filter(Files::isRegularFile).forEach(files::add);
            }

            for (Path file : files) {
                String fileName = file.getFileName().toString();
                String type = Files.probeContentType(file);
                if (byFileName.containsKey(fileName) || isMetadataFile(fileName) || isVideoFile(fileName, type)) {
                    continue;
                }
                byFileName.put(fileName, new Material(
                        "Materiais gerais",
                        fileName,
                        Files.size(file),
                        Instant.ofEpochMilli(file.toFile().lastModified()).toString(),
                        type
                ));
            }
        }

        List<Material> materials = new ArrayList<>(byFileName.values());
        materials.sort(Comparator.comparing((Material item) -> item.uploadedAt).reversed());
        return materials;
    }

    private static boolean isMetadataFile(String fileName) {
        return RECORDINGS_FILE.getFileName().toString().equals(fileName)
                || MATERIALS_FILE.getFileName().toString().equals(fileName);
    }

    private static boolean isVideoFile(String fileName, String type) {
        String normalizedType = type == null ? "" : type.toLowerCase(Locale.ROOT);
        String normalizedName = fileName == null ? "" : fileName.toLowerCase(Locale.ROOT);
        return normalizedType.startsWith("video/")
                || normalizedName.endsWith(".mp4")
                || normalizedName.endsWith(".webm")
                || normalizedName.endsWith(".mov")
                || normalizedName.endsWith(".mkv")
                || normalizedName.endsWith(".avi");
    }

    private static String materialsJson(List<Material> materials) {
        Map<String, List<Material>> byLesson = new LinkedHashMap<>();
        for (Material material : materials) {
            byLesson.computeIfAbsent(material.lessonTitle, k -> new ArrayList<>()).add(material);
        }

        StringBuilder json = new StringBuilder("{");
        int lessonIndex = 0;
        for (Map.Entry<String, List<Material>> entry : byLesson.entrySet()) {
            if (lessonIndex > 0) {
                json.append(',');
            }
            json.append("\"").append(escapeJson(entry.getKey())).append("\":[");
            for (int i = 0; i < entry.getValue().size(); i++) {
                Material material = entry.getValue().get(i);
                if (i > 0) {
                    json.append(',');
                }
                json.append('{')
                        .append("\"lessonTitle\":\"").append(escapeJson(material.lessonTitle)).append("\",")
                        .append("\"name\":\"").append(escapeJson(material.fileName)).append("\",")
                        .append("\"size\":").append(material.size).append(',')
                        .append("\"uploadedAt\":\"").append(escapeJson(material.uploadedAt)).append("\",")
                        .append("\"type\":\"").append(escapeJson(material.type)).append("\"")
                        .append('}');
            }
            json.append(']');
            lessonIndex++;
        }
        json.append("}");
        return json.toString();
    }

    private static String materialsListJson(List<Material> materials) {
        StringBuilder json = new StringBuilder("[");
        for (int i = 0; i < materials.size(); i++) {
            Material material = materials.get(i);
            if (i > 0) json.append(',');
            json.append('{')
                    .append("\"lessonTitle\":\"").append(escapeJson(material.lessonTitle)).append("\",")
                    .append("\"name\":\"").append(escapeJson(material.fileName)).append("\",")
                    .append("\"size\":").append(material.size).append(',')
                    .append("\"uploadedAt\":\"").append(escapeJson(material.uploadedAt)).append("\",")
                    .append("\"type\":\"").append(escapeJson(material.type)).append("\"")
                    .append('}');
        }
        json.append(']');
        return json.toString();
    }

    private static long parseLong(String value, long fallback) {
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException exception) {
            return fallback;
        }
    }

    private static String escapeTsv(String value) {
        return (value == null ? "" : value).replace("\\", "\\\\").replace("\t", "\\t").replace("\n", "\\n").replace("\r", "");
    }

    private static String unescapeTsv(String value) {
        StringBuilder result = new StringBuilder();
        boolean escaping = false;
        for (int i = 0; i < value.length(); i++) {
            char character = value.charAt(i);
            if (!escaping) {
                if (character == '\\') {
                    escaping = true;
                } else {
                    result.append(character);
                }
                continue;
            }
            result.append(character == 't' ? '\t' : character == 'n' ? '\n' : character);
            escaping = false;
        }
        return result.toString();
    }

    private static String normalizeAccountRole(String role) {
        String normalized = role == null ? "" : role.toLowerCase(Locale.ROOT).trim();
        return switch (normalized) {
            case "mestre", "administrador", "aluno" -> normalized;
            default -> "aluno";
        };
    }

    private static String cleanUsername(String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9._-]", "").trim();
    }

    private static void cleanupStaleRooms() {
        synchronized (ROOMS) {
            cleanupStaleRoomsLocked(System.currentTimeMillis());
        }
    }

    private static void cleanupStaleRoomsLocked(long now) {
        List<String> emptyRooms = new ArrayList<>();

        for (Map.Entry<String, Room> entry : ROOMS.entrySet()) {
            Room room = entry.getValue();
            cleanupStaleParticipants(room, now);
            synchronized (room) {
                if (room.participants.isEmpty()) {
                    emptyRooms.add(entry.getKey());
                }
            }
        }

        for (String roomId : emptyRooms) {
            ROOMS.remove(roomId);
        }
    }

    private static void cleanupStaleParticipants(Room room, long now) {
        List<String> removedIds = new ArrayList<>();

        synchronized (room) {
            List<String> staleIds = new ArrayList<>();
            for (Participant participant : room.participants.values()) {
                if (participant.isStale(now)) {
                    staleIds.add(participant.id);
                }
            }

            for (String staleId : staleIds) {
                Participant removed = room.participants.remove(staleId);
                if (removed != null) {
                    removedIds.add(staleId);
                }
            }

            for (String removedId : removedIds) {
                room.broadcast(new SignalMessage("peer-left", removedId, "", "{}"), removedId);
            }

            if (!removedIds.isEmpty()) {
                room.notifyAll();
            }
        }
    }

    private static boolean isAccountOnlineLocked(String username) {
        for (Room room : ROOMS.values()) {
            synchronized (room) {
                for (Participant participant : room.participants.values()) {
                    if (participant.username.equals(username)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    private static void leaveRoom(String roomId, String participantId, String username) {
        Room room;
        synchronized (ROOMS) {
            room = ROOMS.get(roomId);
        }
        if (room == null || username.isBlank()) {
            return;
        }

        List<String> removedIds = new ArrayList<>();
        synchronized (room) {
            List<String> idsToRemove = new ArrayList<>();
            for (Participant participant : room.participants.values()) {
                if (participant.username.equals(username)) {
                    idsToRemove.add(participant.id);
                }
            }

            for (String idToRemove : idsToRemove) {
                Participant removed = room.participants.remove(idToRemove);
                if (removed != null) {
                    removedIds.add(idToRemove);
                }
            }

            for (String removedId : removedIds) {
                room.broadcast(new SignalMessage("peer-left", removedId, "", "{}"), removedId);
            }

            if (!removedIds.isEmpty()) {
                room.notifyAll();
            }
        }

        synchronized (ROOMS) {
            if (room.participants.isEmpty()) {
                ROOMS.remove(roomId);
            }
        }
    }

    private static String messagesJson(List<SignalMessage> messages) {
        StringBuilder json = new StringBuilder("[");
        for (int i = 0; i < messages.size(); i++) {
            SignalMessage message = messages.get(i);
            if (i > 0) {
                json.append(',');
            }
            json.append('{')
                    .append("\"type\":\"").append(escapeJson(message.type)).append("\",")
                    .append("\"from\":\"").append(escapeJson(message.from)).append("\",")
                    .append("\"target\":\"").append(escapeJson(message.target)).append("\",")
                    .append("\"payload\":\"").append(escapeJson(message.payload)).append("\"")
                    .append('}');
        }
        json.append(']');
        return json.toString();
    }

    private static String participantJson(Participant participant) {
        return "{"
                + "\"id\":\"" + escapeJson(participant.id) + "\","
                + "\"username\":\"" + escapeJson(participant.username) + "\","
                + "\"name\":\"" + escapeJson(participant.name) + "\","
                + "\"role\":\"" + escapeJson(participant.role) + "\","
                + "\"accountRole\":\"" + escapeJson(participant.accountRole) + "\""
                + "}";
    }

    private static String readBody(HttpExchange exchange) throws IOException {
        return new String(readAll(exchange.getRequestBody()), StandardCharsets.UTF_8);
    }

    private static Map<String, String> parseSimpleJson(String json) {
        Map<String, String> values = new LinkedHashMap<>();
        int index = 0;
        while (index < json.length()) {
            int keyStart = json.indexOf('"', index);
            if (keyStart < 0) {
                break;
            }
            int keyEnd = findJsonStringEnd(json, keyStart + 1);
            if (keyEnd < 0) {
                break;
            }
            int colon = json.indexOf(':', keyEnd);
            int valueStart = colon < 0 ? -1 : json.indexOf('"', colon);
            if (valueStart < 0) {
                break;
            }
            int valueEnd = findJsonStringEnd(json, valueStart + 1);
            if (valueEnd < 0) {
                break;
            }
            String key = unescapeJson(json.substring(keyStart + 1, keyEnd));
            String value = unescapeJson(json.substring(valueStart + 1, valueEnd));
            values.put(key, value);
            index = valueEnd + 1;
        }
        return values;
    }

    private static int findJsonStringEnd(String json, int start) {
        boolean escaping = false;
        for (int i = start; i < json.length(); i++) {
            char character = json.charAt(i);
            if (escaping) {
                escaping = false;
            } else if (character == '\\') {
                escaping = true;
            } else if (character == '"') {
                return i;
            }
        }
        return -1;
    }

    private static String unescapeJson(String value) {
        StringBuilder result = new StringBuilder();
        boolean escaping = false;
        for (int i = 0; i < value.length(); i++) {
            char character = value.charAt(i);
            if (!escaping) {
                if (character == '\\') {
                    escaping = true;
                } else {
                    result.append(character);
                }
                continue;
            }

            switch (character) {
                case 'n' -> result.append('\n');
                case 'r' -> result.append('\r');
                case 't' -> result.append('\t');
                default -> result.append(character);
            }
            escaping = false;
        }
        return result.toString();
    }

    private static String cleanToken(String value) {
        String cleaned = value == null ? "" : value.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9_-]", "-");
        if (cleaned.isBlank()) {
            return "sala-principal";
        }
        return limit(cleaned, 40);
    }

    private static String limit(String value, int maxLength) {
        if (value == null) {
            return "";
        }
        String trimmed = value.trim();
        return trimmed.length() <= maxLength ? trimmed : trimmed.substring(0, maxLength);
    }

    private static MultipartFile parseMultipart(byte[] body, String boundary) {
        String payload = new String(body, StandardCharsets.ISO_8859_1);
        String delimiter = "--" + boundary;
        String[] parts = payload.split(delimiter);

        for (String part : parts) {
            if (!part.contains("filename=\"")) {
                continue;
            }

            int headerEnd = part.indexOf("\r\n\r\n");
            if (headerEnd < 0) {
                continue;
            }

            String headers = part.substring(0, headerEnd);
            String fileName = extractFileName(headers);
            int contentStart = headerEnd + 4;
            int contentEnd = part.lastIndexOf("\r\n");
            if (contentEnd < contentStart) {
                continue;
            }

            byte[] content = part.substring(contentStart, contentEnd).getBytes(StandardCharsets.ISO_8859_1);
            return new MultipartFile(fileName, content);
        }

        return null;
    }

    private static String extractBoundary(String contentType) {
        for (String segment : contentType.split(";")) {
            String trimmed = segment.trim();
            if (trimmed.startsWith("boundary=")) {
                return trimmed.substring("boundary=".length()).replace("\"", "");
            }
        }
        return null;
    }

    private static String extractFileName(String headers) {
        int start = headers.indexOf("filename=\"");
        if (start < 0) {
            return "";
        }
        start += "filename=\"".length();
        int end = headers.indexOf('"', start);
        return end > start ? headers.substring(start, end) : "";
    }

    private static byte[] readAll(InputStream input) throws IOException {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        byte[] data = new byte[8192];
        int read;
        while ((read = input.read(data)) != -1) {
            buffer.write(data, 0, read);
        }
        return buffer.toByteArray();
    }

    private static Path uniquePath(Path target) {
        if (!Files.exists(target)) {
            return target;
        }

        String fileName = target.getFileName().toString();
        String base = fileName;
        String extension = "";
        int dot = fileName.lastIndexOf('.');
        if (dot > 0) {
            base = fileName.substring(0, dot);
            extension = fileName.substring(dot);
        }

        int counter = 1;
        Path candidate;
        do {
            candidate = target.getParent().resolve(base + "-" + counter + extension);
            counter++;
        } while (Files.exists(candidate));
        return candidate;
    }

    private static String sanitizeFileName(String name) {
        String cleaned = Paths.get(name == null ? "" : name).getFileName().toString();
        return cleaned.replaceAll("[^a-zA-Z0-9._ -]", "_").trim();
    }

    private static Map<String, String> parseQuery(String rawQuery) {
        Map<String, String> values = new HashMap<>();
        if (rawQuery == null || rawQuery.isBlank()) {
            return values;
        }

        for (String pair : rawQuery.split("&")) {
            String[] parts = pair.split("=", 2);
            String key = urlDecode(parts[0]);
            String value = parts.length > 1 ? urlDecode(parts[1]) : "";
            values.put(key, value);
        }
        return values;
    }

    private static String urlDecode(String value) {
        return URLDecoder.decode(value, StandardCharsets.UTF_8);
    }

    private static int configuredPort() {
        String value = System.getenv("PORT");
        if (value == null || value.isBlank()) {
            return 8080;
        }
        try {
            return Integer.parseInt(value.trim());
        } catch (NumberFormatException exception) {
            return 8080;
        }
    }

    private static String contentType(Path file) throws IOException {
        String detected = Files.probeContentType(file);
        if (detected != null) {
            return detected;
        }

        String name = file.getFileName().toString().toLowerCase(Locale.ROOT);
        if (name.endsWith(".js")) {
            return "text/javascript; charset=utf-8";
        }
        if (name.endsWith(".css")) {
            return "text/css; charset=utf-8";
        }
        if (name.endsWith(".html")) {
            return "text/html; charset=utf-8";
        }
        return "application/octet-stream";
    }

    private static void sendJson(HttpExchange exchange, int status, String json) throws IOException {
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        sendBytes(exchange, status, json.getBytes(StandardCharsets.UTF_8));
    }

    private static void sendText(HttpExchange exchange, int status, String text) throws IOException {
        exchange.getResponseHeaders().set("Content-Type", "text/plain; charset=utf-8");
        sendBytes(exchange, status, text.getBytes(StandardCharsets.UTF_8));
    }

    private static void sendBytes(HttpExchange exchange, int status, byte[] bytes) throws IOException {
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream body = exchange.getResponseBody()) {
            body.write(bytes);
        }
    }

    private static String escapeJson(String value) {
        if (value == null) {
            return "";
        }
        return value.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r");
    }

    private static class Room {
        private final String id;
        private final boolean privateRoom;
        private final String password;
        private final Map<String, Participant> participants = new LinkedHashMap<>();

        private Room(String id, boolean privateRoom, String password) {
            this.id = id;
            this.privateRoom = privateRoom;
            this.password = password;
        }

        private void sendTo(String participantId, SignalMessage message) {
            Participant participant = participants.get(participantId);
            if (participant != null) {
                participant.queue.add(message);
            }
        }

        private void broadcast(SignalMessage message, String exceptParticipantId) {
            for (Participant participant : participants.values()) {
                if (!participant.id.equals(exceptParticipantId)) {
                    participant.queue.add(message);
                }
            }
        }
    }

    private static class Participant {
        private final String id;
        private final String username;
        private final String name;
        private final String role;
        private final String accountRole;
        private final List<SignalMessage> queue = new ArrayList<>();
        private long lastSeenAt;

        private Participant(String id, String username, String name, String role, String accountRole) {
            this.id = id;
            this.username = username;
            this.name = name.isBlank() ? "Participante" : name;
            this.role = role;
            this.accountRole = accountRole;
            touch();
        }

        private void touch() {
            lastSeenAt = System.currentTimeMillis();
        }

        private boolean isStale(long now) {
            return now - lastSeenAt > PARTICIPANT_TIMEOUT_MILLIS;
        }
    }

    private static class UserAccount {
        private final String username;
        private final String password;
        private final String name;
        private final String role;
        private final String company;
        private final boolean active;

        private UserAccount(String username, String password, String name, String role, String company, boolean active) {
            this.username = username;
            this.password = password;
            this.name = name.isBlank() ? username : name;
            this.role = role;
            this.company = company.isBlank() ? "Sem empresa" : company;
            this.active = active;
        }
    }

    private record SignalMessage(String type, String from, String target, String payload) {
    }

    private record LessonRecording(String title, String fileName, long size, String modified, String type) {
    }

    private record Material(String lessonTitle, String fileName, long size, String uploadedAt, String type) {
    }

    private record MultipartFile(String fileName, byte[] content) {
    }
}
