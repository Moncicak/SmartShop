FROM python:3.13-slim

WORKDIR /app

# System deps (incl. Node.js — needed to run the Rohlík MCP server over stdio)
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    curl \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# Pre-install the Rohlík MCP server so runtime doesn't fetch it from the network
RUN npm install -g @tomaspavlin/rohlik-mcp

# Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source (overridden by volume mount in dev)
COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
