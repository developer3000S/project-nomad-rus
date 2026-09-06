#!/bin/bash

# Порт, который нужно проверить
PORT=3000

# Проверка занятости порта
if lsof -i :$PORT; then
    echo "Порт $PORT занят. Очистка порта..."
    # Очистка порта
    kill -9 $(lsof -t -i :$PORT)
    echo "Порт $PORT очищен."
else
    echo "Порт $PORT свободен."
fi

# Удаление старого образа Docker
echo "Удаление старого образа Docker..."
docker rmi -f project-nomad

# Построение нового образа Docker
echo "Построение нового образа Docker..."
docker build -t project-nomad .

# Запуск нового образа Docker
echo "Запуск нового образа Docker..."
docker run -p $PORT:8080 project-nomad
