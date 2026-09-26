# Elaya's hands — the second WhatsApp number on Fargate (docs/architecture/hands-plan.md, Layer A).
# Build from the REPO ROOT (the app imports the watcher's pure modules by relative path):
#   docker build -f connector-hands/Dockerfile .
# Its session lives in hands.auth_state (Postgres), its files in the hands-media bucket — the
# container is disposable. A separate task from the Sia watcher: stopping one never touches the other.
FROM node:22-slim
WORKDIR /app
COPY connector/package.json connector/package-lock.json ./connector/
RUN cd connector && npm ci
COPY connector/tsconfig.json ./connector/
COPY connector/src ./connector/src
COPY connector-hands/package.json connector-hands/package-lock.json* ./connector-hands/
RUN cd connector-hands && npm install --omit=dev
COPY connector-hands/tsconfig.json ./connector-hands/
COPY connector-hands/src ./connector-hands/src
WORKDIR /app/connector-hands
CMD ["npx", "tsx", "src/index.ts"]
