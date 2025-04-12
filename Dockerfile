# 1️⃣ Utiliser une image Node.js 22.14.0 officielle
FROM node:22.14.0

# 2️⃣ Définir le répertoire de travail
WORKDIR /app

# 3️⃣ Copier uniquement les fichiers nécessaires pour installer les dépendances
COPY package.json pnpm-lock.yaml ./

# 4️⃣ Installer PNPM (gestionnaire de paquets)
RUN corepack enable && corepack prepare pnpm@latest --activate

# 5️⃣ Installer les dépendances du projet
RUN pnpm install --frozen-lockfile

# 6️⃣ Copier le reste du code
COPY . .

# 7️⃣ Exposer le port 3333 pour que l'application soit accessible
EXPOSE 3334

# 8️⃣ Démarrer le serveur AdonisJS
CMD ["node", "ace", "serve"]
