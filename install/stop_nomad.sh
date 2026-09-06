#!/bin/bash

echo "Поиск запущенных контейнеров Docker для Project NOMAD.."

containers=$(docker ps --filter "name=^nomad_" --format "{{.Names}}")

if [ -z "$containers" ]; then
    echo "Запущенные контейнеры для Project NOMAD не найдены"
    exit 0
fi

echo "Обнаружены следующие запущенные контейнеры:"
echo "$containers"
echo ""

for container in $containers; do
    echo "Корректная остановка контейнера: $container"
    if docker stop "$container"; then
        echo "✓ Контейнер $container успешно остановлен"
    else
        echo "✗ Не удалось остановить контейнер $container"
    fi
    echo ""
done

echo "Завершение корректного завершения работы всех контейнеров Project NOMAD."