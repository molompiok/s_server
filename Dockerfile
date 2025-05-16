# ---- Stage 1: Dependencies ----
FROM node:20-alpine AS deps

WORKDIR /app

# Copier uniquement les fichiers de gestion des dépendances
COPY package.json pnpm-lock.yaml ./

# Installer PNPM
RUN corepack enable && corepack prepare pnpm@latest --activate

# Installer UNIQUEMENT les dépendances de production d'abord pour profiter du cache
# si les dépendances de dev changent mais pas celles de prod
RUN pnpm install --prod --frozen-lockfile

# ---- Stage 2: Builder ----
# Ce stage hérite de l'image node:20-alpine mais on pourrait utiliser la même que deps
FROM node:20-alpine AS builder

WORKDIR /app

# Copier les dépendances de production installées au stage précédent
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/pnpm-lock.yaml ./pnpm-lock.yaml

# Installer PNPM (nécessaire si le stage précédent ne le fait pas globalement ou si c'est un nouveau FROM)
RUN corepack enable && corepack prepare pnpm@latest --activate

# Installer TOUTES les dépendances (incluant devDependencies pour le build TypeScript)
# Si pnpm-lock.yaml a changé, ou si package.json a changé, cette couche sera reconstruite.
# On pourrait optimiser en ne faisant `pnpm install --frozen-lockfile` que si devDependencies sont nécessaires
# et que les dépendances de production sont déjà là.
# Pour la simplicité, on refait un install complet qui utilisera le cache si possible.
RUN pnpm install --frozen-lockfile

# Copier le reste du code source de l'application
COPY . .

# Compiler TypeScript et construire l'application AdonisJS
# La commande `build` d'AdonisJS 6 compile TS vers JS dans le dossier `build/`
# et copie les fichiers nécessaires (config, public, resources, etc.)
RUN npm run build
# Ou si vous utilisez pnpm directement pour les scripts:
# RUN pnpm build

# Optionnel: Pruner les devDependencies après le build si vous voulez économiser
# de l'espace si vous copiez node_modules tel quel dans le stage final.
# Mais il est généralement préférable de ne copier que le dossier `build` et
# réinstaller les dépendances de production dans le stage final.
# Alternative: ne copier que le dossier `build` et le `package.json` puis `pnpm install --prod` dans le stage final.

# ---- Stage 3: Runtime ----
FROM node:20-alpine AS runtime

WORKDIR /app

# Créer un utilisateur non-root et un groupe
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copier les fichiers nécessaires depuis le stage builder
# On copie le dossier `build` qui contient le code JS compilé et les assets.
COPY --from=builder /app/build .

# Copier package.json et pnpm-lock.yaml pour installer les dépendances de production uniquement
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml

# Installer PNPM
RUN corepack enable && corepack prepare pnpm@latest --activate

# Installer UNIQUEMENT les dépendances de production
RUN pnpm install --prod --frozen-lockfile

# Changer le propriétaire des fichiers de l'application
# Le WORKDIR /app existe déjà
# Donner la propriété du répertoire de l'application à l'utilisateur non-root
RUN chown -R appuser:appgroup /app

# Passer à l'utilisateur non-root
USER appuser

# Exposer le port (sera défini par la variable d'environnement PORT)
# La variable d'environnement PORT sera injectée par Swarm / s_server
# EXPOSE 3333 # Ce n'est qu'informatif, le mapping se fait au runtime

# Variables d'environnement par défaut (peuvent être surchargées)
ENV HOST=0.0.0.0
ENV NODE_ENV=production
# PORT sera injecté par Swarm ou s_server

# Commande pour démarrer l'application de production
# AdonisJS 6 utilise `./bin/server.js` après le build
CMD ["node", "./bin/server.js"]