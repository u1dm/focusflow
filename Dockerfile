FROM node:20-alpine

WORKDIR /app

# Копируем файлы манифестов
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci --only=production

# Копируем исходный код
COPY . .

# Создаем директорию для БД (K8s будет монтировать сюда PVC)
RUN mkdir -p /app/data

ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
