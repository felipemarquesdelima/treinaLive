FROM eclipse-temurin:21-jdk

WORKDIR /app

COPY src ./src
COPY public ./public

RUN mkdir -p bin uploads \
    && javac -encoding UTF-8 -d bin src/App.java

ENV PORT=8080
EXPOSE 8080

CMD ["java", "-cp", "bin", "App"]
