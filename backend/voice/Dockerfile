# Elaya's voice worker — small and boring, like the brain's image.
# Outbound only: it dials LiveKit Cloud and the brain; nothing dials it.
FROM python:3.13-slim

WORKDIR /srv

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY agent.py .

# The local fallback of the turn detector and the VAD are fetched at build
# time, so a cold task never downloads a model on its first call.
RUN python -m livekit.agents download-files

ENV ENV=production

CMD ["python", "agent.py", "start"]
