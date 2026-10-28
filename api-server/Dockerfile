# ── Build stage ───────────────────────────────────────────────────────────────
FROM golang:1.21-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o lottery-api-server .

# ── Runtime stage ──────────────────────────────────────────────────────────────
FROM alpine:3.19

# ca-certificates is required for TLS connections to PostgreSQL cloud providers
RUN apk --no-cache add ca-certificates

WORKDIR /app
COPY --from=builder /app/lottery-api-server .

EXPOSE 8090

CMD ["./lottery-api-server"]
