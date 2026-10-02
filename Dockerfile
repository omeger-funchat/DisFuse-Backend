FROM node:20-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
ENV PORT=7860
EXPOSE 7860
CMD ["npm", "start"]
