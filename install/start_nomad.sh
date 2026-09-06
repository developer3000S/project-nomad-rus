#!/bin/bash

echo "Поиск контейнеров Project NOMAD..."

# -a включает все контейнеры (запущенные и остановленные)
containers=$(docker ps -a --filter "name=^nomad_" --format "{{.Names}}")

if [ -z "$containers" ]; then
    echo "Контейнеры для Project NOMAD не найдены. Установлен ли он?"
    exit 0
fi

echo "Обнаружены следующие контейнеры:"
echo "$containers"
echo ""

for container in $containers; do
    echo "Запуск контейнера: $container"
    if docker start "$container"; then
        echo "✓ Контейнер $container успешно запущен"
    else
        echo "✗ Не удалось запустить контейнер $container"
    fi
    echo ""
done

echo "Запуск всех контейнеров Project NOMAD завершён."
