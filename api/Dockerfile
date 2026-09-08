FROM golang:1.23-alpine
RUN apk add --no-cache git
WORKDIR /src
COPY go.mod ./
RUN go mod download || true
COPY . .
EXPOSE 8090
CMD ["sh", "-c", "go mod tidy && go run ./cmd/api"]
