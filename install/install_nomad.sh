#!/bin/bash

# Скрипт установки Project NOMAD

###################################################################################################################################################################################################

# Скрипт               | Скрипт установки Project NOMAD
# Версия               | 1.0.0
# Автор                | Crosstalk Solutions, LLC
# Сайт                 | https://crosstalksolutions.com

###################################################################################################################################################################################################
#                                                                                                                                                                                                 #
#                                                                                          Цветовые коды                                                                                          #
#                                                                                                                                                                                                 #
###################################################################################################################################################################################################

RESET='\033[0m'
YELLOW='\033[1;33m'
WHITE_R='\033[39m' # Тот же, что GRAY_R, для терминалов с белым фоном.
GRAY_R='\033[39m'
RED='\033[1;31m' # Светло-красный.
GREEN='\033[1;32m' # Светло-зелёный.

###################################################################################################################################################################################################
#                                                                                                                                                                                                 #
#                                                                                  Константы и переменные                                                                                          #
#                                                                                                                                                                                                 #
###################################################################################################################################################################################################

WHIPTAIL_TITLE="Установка Project NOMAD"
NOMAD_DIR="/opt/project-nomad"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
script_option_debug='true'
accepted_terms='false'
local_ip_address=''

###################################################################################################################################################################################################
#                                                                                                                                                                                                 #
#                                                                                             Функции                                                                                             #
#                                                                                                                                                                                                 #
###################################################################################################################################################################################################

header() {
  if [[ "${script_option_debug}" != 'true' ]]; then clear; clear; fi
  echo -e "${GREEN}#########################################################################${RESET}\\n"
}

header_red() {
  if [[ "${script_option_debug}" != 'true' ]]; then clear; clear; fi
  echo -e "${RED}#########################################################################${RESET}\\n"
}

check_has_sudo() {
  if sudo -n true 2>/dev/null; then
    echo -e "${GREEN}#${RESET} Пользователь имеет права sudo.\\n"
  else
    echo "У пользователя нет прав sudo"
    header_red
    echo -e "${RED}#${RESET} Для запуска этого скрипта необходимы права sudo. Запустите скрипт с sudo.\\n"
    echo -e "${RED}#${RESET} Например: sudo bash $(basename "$0")"
    exit 1
  fi
}

check_is_bash() {
  if [[ -z "$BASH_VERSION" ]]; then
    header_red
    echo -e "${RED}#${RESET} Для запуска этого скрипта необходим bash. Запустите скрипт с использованием bash.\\n"
    echo -e "${RED}#${RESET} Например: bash $(basename "$0")"
    exit 1
  fi
    echo -e "${GREEN}#${RESET} Скрипт запущен в bash.\\n"
}

check_is_debian_based() {
  if [[ ! -f /etc/debian_version ]]; then
    header_red
    echo -e "${RED}#${RESET} Этот скрипт предназначен только для систем на основе Debian.\\n"
    echo -e "${RED}#${RESET} Запустите этот скрипт на системе на основе Debian и попробуйте снова."
    exit 1
  fi
    echo -e "${GREEN}#${RESET} Скрипт запущен на системе на основе Debian.\\n"
}

check_is_x86_64() {
  local arch
  arch="$(uname -m)"
  if [[ "${arch}" != "x86_64" && "${arch}" != "amd64" ]]; then
    echo -e "${YELLOW}#${RESET} ПРЕДУПРЕЖДЕНИЕ: Обнаружена архитектура '${arch}'. NOMAD официально поддерживает только x86_64.\\n"
    echo -e "${YELLOW}#${RESET} Поддержка ARM64/aarch64 отслеживается в PR #419 и ещё не готова.\\n"
    echo -e "${YELLOW}#${RESET} Продолжение работы на неподдерживаемой архитектуре, скорее всего, завершится сбоем и может оставить\\n"
    echo -e "${YELLOW}#${RESET} частично загруженные образы Docker и файлы, которые потребуется очистить вручную.\\n"
    echo -e "${YELLOW}#${RESET} Продолжение через 10 секунд... нажмите Ctrl+C для отмены.\\n"
    sleep 10
    return
  fi
  echo -e "${GREEN}#${RESET} Проверка архитектуры пройдена (${arch}).\\n"
}

ensure_dependencies_installed() {
  local missing_deps=()

  # Проверка наличия curl
  if ! command -v curl &> /dev/null; then
    missing_deps+=("curl")
  fi

  # Проверка наличия gpg (нужен для добавления ключа NVIDIA container toolkit)
  if ! command -v gpg &> /dev/null; then
    missing_deps+=("gpg")
  fi

  # Проверка наличия whiptail (используется для диалогов, хотя сейчас не активен)
  # if ! command -v whiptail &> /dev/null; then
  #   missing_deps+=("whiptail")
  # fi

  if [[ ${#missing_deps[@]} -gt 0 ]]; then
    echo -e "${YELLOW}#${RESET} Установка необходимых зависимостей: ${missing_deps[*]}...\\n"
    sudo apt-get update
    sudo apt-get install -y "${missing_deps[@]}"

    # Проверка успешной установки
    for dep in "${missing_deps[@]}"; do
      if ! command -v "$dep" &> /dev/null; then
        echo -e "${RED}#${RESET} Не удалось установить $dep. Установите его вручную и попробуйте снова."
        exit 1
      fi
    done
    echo -e "${GREEN}#${RESET} Зависимости успешно установлены.\\n"
  else
    echo -e "${GREEN}#${RESET} Все необходимые зависимости уже установлены.\\n"
  fi
}

check_is_debug_mode(){
  # Проверка, запущен ли скрипт в режиме отладки
  if [[ "${script_option_debug}" == 'true' ]]; then
    echo -e "${YELLOW}#${RESET} Включён режим отладки, экран не будет очищаться...\\n"
  else
    clear; clear
  fi
}

generateRandomPass() {
  local length="${1:-32}"  # По умолчанию 32
  local password

  # Генерация случайного пароля через /dev/urandom
  password=$(tr -dc 'A-Za-z0-9' < /dev/urandom | head -c "$length")

  echo "$password"
}

ensure_docker_installed() {
  if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}#${RESET} Docker не найден. Установка Docker...\\n"

    # Обновление базы пакетов
    sudo apt-get update

    # Установка предварительных зависимостей
    sudo apt-get install -y ca-certificates curl

    # Создание каталога для ключей
    # sudo install -m 0755 -d /etc/apt/keyrings

    # # Загрузка официального GPG-ключа Docker
    # sudo curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
    # sudo chmod a+r /etc/apt/keyrings/docker.asc

    # # Добавление репозитория в источники Apt
    # echo \
    #   "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian \
    #   $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    #   sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

    # # Обновление базы пакетов с учётом добавленного репозитория Docker
    # sudo apt-get update

    # # Установка пакетов Docker
    # sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    # Загрузка скрипта-установщика Docker
    curl -fsSL https://get.docker.com -o get-docker.sh

    # Запуск скрипта установки Docker
    sudo sh get-docker.sh

    # Проверка успешной установки Docker
    if ! command -v docker &> /dev/null; then
      echo -e "${RED}#${RESET} Установка Docker не удалась. Проверьте логи и попробуйте снова."
      exit 1
    fi

    echo -e "${GREEN}#${RESET} Установка Docker завершена.\\n"
  else
    echo -e "${GREEN}#${RESET} Docker уже установлен.\\n"

    # Проверка, запущен ли сервис Docker
    if ! systemctl is-active --quiet docker; then
      echo -e "${YELLOW}#${RESET} Docker установлен, но не запущен. Попытка запустить Docker...\\n"
      sudo systemctl start docker
      if ! systemctl is-active --quiet docker; then
        echo -e "${RED}#${RESET} Не удалось запустить Docker. Проверьте статус сервиса Docker и попробуйте снова."
        exit 1
      else
        echo -e "${GREEN}#${RESET} Сервис Docker успешно запущен.\\n"
      fi
    else
      echo -e "${GREEN}#${RESET} Сервис Docker уже запущен.\\n"
    fi
  fi
}

check_docker_compose() {
  # Проверка доступности 'docker compose' (плагин v2)
  if ! docker compose version &>/dev/null; then
    echo -e "${RED}#${RESET} Docker Compose v2 не установлен или недоступен как плагин Docker."
    echo -e "${YELLOW}#${RESET} Этот скрипт требует 'docker compose' (v2), а не 'docker-compose' (v1)."
    echo -e "${YELLOW}#${RESET} См. документацию Docker по адресу https://docs.docker.com/compose/install/ для инструкций по установке Docker Compose v2."
    exit 1
  fi
}

setup_nvidia_container_toolkit() {
  # Эта функция пытается настроить поддержку NVIDIA GPU, но не блокирует работу
  # Любые ошибки приведут к предупреждениям, но НЕ остановят процесс установки

  echo -e "${YELLOW}#${RESET} Проверка наличия NVIDIA GPU...\\n"

  # Безопасное определение наличия NVIDIA GPU
  local has_nvidia_gpu=false
  if command -v lspci &> /dev/null; then
    if lspci 2>/dev/null | grep -i nvidia &> /dev/null; then
      has_nvidia_gpu=true
      echo -e "${GREEN}#${RESET} Обнаружен NVIDIA GPU.\\n"
    fi
  fi

  # Также проверка через nvidia-smi
  if ! $has_nvidia_gpu && command -v nvidia-smi &> /dev/null; then
    if nvidia-smi &> /dev/null; then
      has_nvidia_gpu=true
      echo -e "${GREEN}#${RESET} NVIDIA GPU обнаружен через nvidia-smi.\\n"
    fi
  fi

  if ! $has_nvidia_gpu; then
    echo -e "${YELLOW}#${RESET} NVIDIA GPU не обнаружен. Пропуск установки NVIDIA container toolkit.\\n"
    return 0
  fi

  # Проверка, установлен ли уже nvidia-container-toolkit
  if command -v nvidia-ctk &> /dev/null; then
    echo -e "${GREEN}#${RESET} NVIDIA container toolkit уже установлен.\\n"
    return 0
  fi

  echo -e "${YELLOW}#${RESET} Установка NVIDIA container toolkit...\\n"

  # Установка зависимостей согласно https://docs.ollama.com/docker — с обработкой ошибок
  if ! curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey 2>/dev/null | sudo gpg --batch --yes --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg 2>/dev/null; then
    echo -e "${YELLOW}#${RESET} Предупреждение: Не удалось добавить GPG-ключ NVIDIA container toolkit. Продолжаем в любом случае...\\n"
    return 0
  fi

  if ! curl -fsSL https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list 2>/dev/null \
      | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
      | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list > /dev/null 2>&1; then
    echo -e "${YELLOW}#${RESET} Предупреждение: Не удалось добавить репозиторий NVIDIA container toolkit. Продолжаем в любом случае...\\n"
    return 0
  fi

  if ! sudo apt-get update 2>/dev/null; then
    echo -e "${YELLOW}#${RESET} Предупреждение: Не удалось обновить список пакетов. Продолжаем в любом случае...\\n"
    return 0
  fi

  if ! sudo apt-get install -y nvidia-container-toolkit 2>/dev/null; then
    echo -e "${YELLOW}#${RESET} Предупреждение: Не удалось установить NVIDIA container toolkit. Продолжаем в любом случае...\\n"
    return 0
  fi

  echo -e "${GREEN}#${RESET} NVIDIA container toolkit успешно установлен.\\n"

  # Настройка Docker на использование runtime NVIDIA
  echo -e "${YELLOW}#${RESET} Настройка Docker на использование runtime NVIDIA...\\n"

  if ! sudo nvidia-ctk runtime configure --runtime=docker 2>/dev/null; then
    echo -e "${YELLOW}#${RESET} Команда nvidia-ctk configure не удалась, попытка ручной настройки...\\n"

    # Запасной вариант: ручная настройка daemon.json
    local daemon_json="/etc/docker/daemon.json"
    local config_success=false

    if [[ -f "$daemon_json" ]]; then
      # Резервное копирование существующей конфигурации (по возможности)
      sudo cp "$daemon_json" "${daemon_json}.backup" 2>/dev/null || true

      # Проверка, не существует ли уже runtime nvidia
      if ! grep -q '"nvidia"' "$daemon_json" 2>/dev/null; then
        # Добавление runtime nvidia в существующую конфигурацию через jq, если он доступен
        if command -v jq &> /dev/null; then
          if sudo jq '. + {"runtimes": {"nvidia": {"path": "nvidia-container-runtime", "runtimeArgs": []}}}' "$daemon_json" > /tmp/daemon.json.tmp 2>/dev/null; then
            if sudo mv /tmp/daemon.json.tmp "$daemon_json" 2>/dev/null; then
              config_success=true
            fi
          fi
          # Очистка временного файла, если перемещение не удалось
          sudo rm -f /tmp/daemon.json.tmp 2>/dev/null || true
        else
          echo -e "${YELLOW}#${RESET} jq недоступен, пропуск ручной настройки daemon.json...\\n"
        fi
      else
        config_success=true  # Уже настроено
      fi
    else
      # Создание нового daemon.json с runtime nvidia (по возможности)
      if echo '{"runtimes":{"nvidia":{"path":"nvidia-container-runtime","runtimeArgs":[]}}}' | sudo tee "$daemon_json" > /dev/null 2>&1; then
        config_success=true
      fi
    fi

    if ! $config_success; then
      echo -e "${YELLOW}#${RESET} Ручная настройка daemon.json не удалась. Для работы GPU может потребоваться ручная настройка.\\n"
    fi
  fi

  # Перезапуск сервиса Docker
  echo -e "${YELLOW}#${RESET} Перезапуск сервиса Docker...\\n"
  if ! sudo systemctl restart docker 2>/dev/null; then
    echo -e "${YELLOW}#${RESET} Предупреждение: Не удалось перезапустить сервис Docker. Возможно, потребуется сделать это вручную.\\n"
    return 0
  fi

  # Проверка доступности runtime NVIDIA
  echo -e "${YELLOW}#${RESET} Проверка конфигурации runtime NVIDIA...\\n"
  sleep 2  # Небольшая пауза, чтобы Docker успел полностью перезапуститься

  if docker info 2>/dev/null | grep -q "nvidia"; then
    echo -e "${GREEN}#${RESET} Runtime NVIDIA успешно настроен и проверен.\\n"
  else
    echo -e "${YELLOW}#${RESET} Предупреждение: Runtime NVIDIA не обнаружен в выводе docker info. Ускорение GPU может не работать.\\n"
    echo -e "${YELLOW}#${RESET} Возможно, потребуется вручную настроить /etc/docker/daemon.json и перезапустить Docker.\\n"
  fi

  echo -e "${GREEN}#${RESET} Настройка NVIDIA container toolkit завершена.\\n"
}

get_install_confirmation(){
  echo -e "${YELLOW}#${RESET} Этот скрипт установит Project NOMAD и его зависимости на ваш компьютер."
  echo -e "${YELLOW}#${RESET} Если у вас уже установлен Project NOMAD с изменённой конфигурацией или данными, имейте в виду, что запуск этого скрипта установки может перезаписать существующие файлы и настройки. Настоятельно рекомендуется создать резервную копию важных данных/конфигураций перед продолжением."
  read -p "Вы уверены, что хотите продолжить? (y/N): " choice
  case "$choice" in
    y|Y )
      echo -e "${GREEN}#${RESET} Пользователь решил продолжить установку."
      ;;
    * )
      echo "Пользователь решил не продолжать установку."
      exit 0
      ;;
  esac
}

accept_terms() {
  printf "\n\n"
  echo "Лицензионное соглашение и условия использования"
  echo "__________________________"
  printf "\n\n"
  echo "Project NOMAD распространяется по лицензии Apache License 2.0. Полный текст лицензии доступен по адресу https://www.apache.org/licenses/LICENSE-2.0 или в файле LICENSE этого репозитория."
  printf "\n"
  echo "Принимая это соглашение, вы подтверждаете, что прочитали и поняли условия Apache License 2.0 и обязуетесь их соблюдать при использовании Project NOMAD"
  echo -e "\n\n"
  read -p "Я прочитал и принимаю Лицензионное соглашение и условия использования (y/N)? " choice
  case "$choice" in
    y|Y )
      accepted_terms='true'
      ;;
    * )
      echo "Лицензионное соглашение и условия использования не приняты. Установка не может быть продолжена."
      exit 1
      ;;
  esac
}

create_nomad_directory(){
  # Убедиться, что основной каталог установки существует
  if [[ ! -d "$NOMAD_DIR" ]]; then
    echo -e "${YELLOW}#${RESET} Создание каталога для Project NOMAD в $NOMAD_DIR...\\n"
    sudo mkdir -p "$NOMAD_DIR"
    sudo chown "$(whoami):$(whoami)" "$NOMAD_DIR"

    echo -e "${GREEN}#${RESET} Каталог успешно создан.\\n"
  else
    echo -e "${GREEN}#${RESET} Каталог $NOMAD_DIR уже существует.\\n"
  fi

  # Также убедиться, что существует подкаталог /storage/logs/
  sudo mkdir -p "${NOMAD_DIR}/storage/logs"

  # Создать файл admin.log в каталоге логов
  sudo touch "${NOMAD_DIR}/storage/logs/admin.log"
}

copy_management_compose_file() {
  local compose_file_path="${NOMAD_DIR}/compose.yml"
  local repo_root
  repo_root="$(cd "${SCRIPT_DIR}/.." && pwd)"

  echo -e "${YELLOW}#${RESET} Копирование docker-compose файла для управления из репозитория...\\n"
  if ! cp "${SCRIPT_DIR}/management_compose.yaml" "$compose_file_path"; then
    echo -e "${RED}#${RESET} Не удалось скопировать файл docker compose. Проверьте наличие ${SCRIPT_DIR}/management_compose.yaml и попробуйте снова."
    exit 1
  fi
  echo -e "${GREEN}#${RESET} Файл docker compose успешно скопирован в $compose_file_path.\\n"

  # Контексты сборки в исходном файле относительные; развёрнутый compose живёт в ${NOMAD_DIR},
  # поэтому прописываем абсолютный путь к корню репозитория, иначе docker будет искать
  # Dockerfile вне дерева исходников.
  echo -e "${YELLOW}#${RESET} Привязка контекстов сборки к ${repo_root}...\\n"
  if ! sed -i "s|context: \.\./\.\.|context: ${repo_root}|g" "$compose_file_path"; then
    echo -e "${RED}#${RESET} Не удалось настроить контексты сборки в файле docker compose."
    exit 1
  fi

  # Контейнер updater пересобирает образы через docker.sock, и compose CLI внутри
  # него читает build-контекст с файловой системы контейнера. Пробрасываем дерево
  # исходников в updater по тому же абсолютному пути (только для чтения).
  echo -e "${YELLOW}#${RESET} Монтирование исходников в контейнер updater...\\n"
  if ! sed -i "\|      - /opt/project-nomad:/opt/project-nomad # Writable access|a\\      - ${repo_root}:${repo_root}:ro # Дерево исходников для локальной пересборки образов" "$compose_file_path"; then
    echo -e "${RED}#${RESET} Не удалось добавить монтирование исходников в файл docker compose."
    exit 1
  fi

  local app_key=$(generateRandomPass)
  local db_root_password=$(generateRandomPass)
  local db_user_password=$(generateRandomPass)

  # Если каталог данных MySQL существует после предыдущей попытки установки, удалить его.
  # MySQL инициализирует учётные данные только при первом запуске, когда каталог данных пуст.
  # Если остались устаревшие данные, MySQL игнорирует новые пароли и использует старые,
  # что вызывает ошибки "Access denied" при попытке подключения контейнера admin.
  if [[ -d "${NOMAD_DIR}/mysql" ]]; then
    echo -e "${YELLOW}#${RESET} Удаление существующего каталога данных MySQL для соответствия учётных данных...\\n"
    sudo rm -rf "${NOMAD_DIR}/mysql"
  fi

  # Подстановка динамических значений окружения в файл compose
  echo -e "${YELLOW}#${RESET} Настройка переменных окружения в файле docker-compose...\\n"
  sed -i "s|URL=replaceme|URL=http://${local_ip_address}:8080|g" "$compose_file_path"
  sed -i "s|APP_KEY=replaceme|APP_KEY=${app_key}|g" "$compose_file_path"

  sed -i "s|DB_PASSWORD=replaceme|DB_PASSWORD=${db_user_password}|g" "$compose_file_path"
  sed -i "s|MYSQL_ROOT_PASSWORD=replaceme|MYSQL_ROOT_PASSWORD=${db_root_password}|g" "$compose_file_path"
  sed -i "s|MYSQL_PASSWORD=replaceme|MYSQL_PASSWORD=${db_user_password}|g" "$compose_file_path"

  echo -e "${GREEN}#${RESET} Файл docker compose успешно настроен.\\n"
}

copy_helper_scripts() {
  local start_script_path="${NOMAD_DIR}/start_nomad.sh"
  local stop_script_path="${NOMAD_DIR}/stop_nomad.sh"
  local update_script_path="${NOMAD_DIR}/update_nomad.sh"

  echo -e "${YELLOW}#${RESET} Копирование вспомогательных скриптов из репозитория...\\n"
  if ! cp "${SCRIPT_DIR}/start_nomad.sh" "$start_script_path"; then
    echo -e "${RED}#${RESET} Не удалось скопировать скрипт запуска. Проверьте наличие ${SCRIPT_DIR}/start_nomad.sh и попробуйте снова."
    exit 1
  fi
  chmod +x "$start_script_path"

  if ! cp "${SCRIPT_DIR}/stop_nomad.sh" "$stop_script_path"; then
    echo -e "${RED}#${RESET} Не удалось скопировать скрипт остановки. Проверьте наличие ${SCRIPT_DIR}/stop_nomad.sh и попробуйте снова."
    exit 1
  fi
  chmod +x "$stop_script_path"

  if ! cp "${SCRIPT_DIR}/update_nomad.sh" "$update_script_path"; then
    echo -e "${RED}#${RESET} Не удалось скопировать скрипт обновления. Проверьте наличие ${SCRIPT_DIR}/update_nomad.sh и попробуйте снова."
    exit 1
  fi
  chmod +x "$update_script_path"

  echo -e "${GREEN}#${RESET} Вспомогательные скрипты успешно загружены в $start_script_path, $stop_script_path и $update_script_path.\\n"
}

start_management_containers() {
  echo -e "${YELLOW}#${RESET} Запуск управляющих контейнеров через docker compose...\\n"
  if ! sudo docker compose -p project-nomad -f "${NOMAD_DIR}/compose.yml" up -d; then
    echo -e "${RED}#${RESET} Не удалось запустить управляющие контейнеры. Проверьте логи и попробуйте снова."
    exit 1
  fi
  echo -e "${GREEN}#${RESET} Управляющие контейнеры успешно запущены.\\n"
}

get_local_ip() {
  local_ip_address=$(hostname -I | awk '{print $1}')
  if [[ -z "$local_ip_address" ]]; then
    echo -e "${RED}#${RESET} Не удалось определить локальный IP-адрес. Проверьте сетевые настройки."
    exit 1
  fi
}
verify_gpu_setup() {
  # Эта функция только отображает статус настройки GPU и полностью неблокирующая
  # Она никогда не завершает работу и не возвращает коды ошибок — чисто информационная

  echo -e "\\n${YELLOW}#${RESET} Проверка настройки GPU\\n"
  echo -e "${YELLOW}===========================================${RESET}\\n"

  # Проверка наличия NVIDIA GPU
  if command -v nvidia-smi &> /dev/null; then
    echo -e "${GREEN}✓${RESET} Обнаружен NVIDIA GPU:"
    nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null | while read -r line; do
      echo -e "  ${WHITE_R}$line${RESET}"
    done
    echo ""
  else
    echo -e "${YELLOW}○${RESET} NVIDIA GPU не обнаружен (nvidia-smi недоступен)\\n"
  fi

  # Проверка установки NVIDIA Container Toolkit
  if command -v nvidia-ctk &> /dev/null; then
    echo -e "${GREEN}✓${RESET} NVIDIA Container Toolkit установлен: $(nvidia-ctk --version 2>/dev/null | head -n1)\\n"
  else
    echo -e "${YELLOW}○${RESET} NVIDIA Container Toolkit не установлен\\n"
  fi

  # Проверка наличия runtime NVIDIA в Docker
  if docker info 2>/dev/null | grep -q "nvidia"; then
    echo -e "${GREEN}✓${RESET} Runtime NVIDIA в Docker настроен\\n"
  else
    echo -e "${YELLOW}○${RESET} Runtime NVIDIA в Docker не обнаружен\\n"
  fi

  # Проверка наличия AMD GPU — только для классов дисплейных контроллеров, чтобы избежать ложных срабатываний
  # от хост-мостов AMD CPU, PCI-мостов и устройств чипсета.
  local has_amd_gpu='false'
  local amd_gfx_version=''
  if command -v lspci &> /dev/null; then
    if lspci 2>/dev/null | grep -iE "VGA|3D controller|Display" | grep -iE "amd|radeon" &> /dev/null; then
      has_amd_gpu='true'
      echo -e "${GREEN}✓${RESET} Обнаружен AMD GPU — ускорение ROCm будет настроено автоматически при установке AI-ассистента.\\n"

      # Сопоставление кодового имени AMD с версией gfx, чтобы admin мог выбрать подходящую HSA_OVERRIDE_GFX_VERSION.
      # gfx1030/1100/1101/1102 находятся в официальном списке поддержки AMD ROCm и НЕ требуют override —
      # принудительное использование (например, 11.0.0) нарушает обнаружение GPU на них. Остальные варианты требуют.
      local amd_devices
      amd_devices=$(lspci -vmm 2>/dev/null | awk -F'\t' '/^Class:.*(VGA|3D|Display)/{c=1} c && /^Device:/{print $2; c=0}')
      if echo "${amd_devices}" | grep -iq 'Navi 21'; then
        amd_gfx_version='gfx1030'
      elif echo "${amd_devices}" | grep -iq 'Navi 22'; then
        amd_gfx_version='gfx1031'
      elif echo "${amd_devices}" | grep -iq 'Navi 23'; then
        amd_gfx_version='gfx1032'
      elif echo "${amd_devices}" | grep -iq 'Navi 24'; then
        amd_gfx_version='gfx1034'
      elif echo "${amd_devices}" | grep -iq 'Rembrandt'; then
        amd_gfx_version='gfx1035'
      elif echo "${amd_devices}" | grep -iEq 'Phoenix[0-9]?|Hawk Point|Radeon (780M|760M)'; then
        # Phoenix (Ryzen 7040) / Hawk Point (Ryzen 8040) — 780M и 760M обе gfx1103.
        # Строки устройств lspci различаются (Phoenix1/Phoenix2/Phoenix3, "Hawk Point" или просто
        # маркетинговое имя "Radeon 780M Graphics"), поэтому сопоставляем все варианты, иначе маркер
        # не будет найден и 780M молча переключится на CPU. См. регрессию gfx1103.
        amd_gfx_version='gfx1103'
      elif echo "${amd_devices}" | grep -iEq 'Strix Halo'; then
        amd_gfx_version='gfx1151'
      elif echo "${amd_devices}" | grep -iEq 'Strix( Point)?'; then
        amd_gfx_version='gfx1150'
      elif echo "${amd_devices}" | grep -iq 'Navi 31'; then
        amd_gfx_version='gfx1100'
      elif echo "${amd_devices}" | grep -iq 'Navi 32'; then
        amd_gfx_version='gfx1101'
      elif echo "${amd_devices}" | grep -iq 'Navi 33'; then
        amd_gfx_version='gfx1102'
      fi
    fi
  fi

  # Запись типа обнаруженного GPU в маркер-файл, который может прочитать контейнер admin.
  # В контейнере admin нет lspci, а AMD GPU не регистрируют Docker runtime, поэтому это
  # единственный надёжный способ сообщить admin о наличии AMD GPU во время установки.
  local gpu_marker_path="${NOMAD_DIR}/storage/.nomad-gpu-type"
  if command -v nvidia-smi &> /dev/null; then
    echo 'nvidia' | sudo tee "${gpu_marker_path}" > /dev/null 2>&1 || true
  elif [[ "${has_amd_gpu}" == 'true' ]]; then
    echo 'amd' | sudo tee "${gpu_marker_path}" > /dev/null 2>&1 || true
  else
    sudo rm -f "${gpu_marker_path}" 2>/dev/null || true
  fi

  # Сопутствующий маркер, используемый admin для выбора подходящей HSA_OVERRIDE_GFX_VERSION
  # для обнаруженной карты. Отсутствие этого файла означает "неизвестный gfx" — admin
  # использует встроенное значение по умолчанию. Всегда перезаписывать (или удалять) при
  # установке, чтобы состояние было актуальным.
  local amd_gfx_marker_path="${NOMAD_DIR}/storage/.nomad-amd-gfx"
  if [[ -n "${amd_gfx_version}" ]]; then
    echo "${amd_gfx_version}" | sudo tee "${amd_gfx_marker_path}" > /dev/null 2>&1 || true
  else
    sudo rm -f "${amd_gfx_marker_path}" 2>/dev/null || true
  fi

  echo -e "${YELLOW}===========================================${RESET}\\n"

  # Итог
  if command -v nvidia-smi &> /dev/null && docker info 2>/dev/null | grep -q "nvidia"; then
    echo -e "${GREEN}#${RESET} Ускорение GPU корректно настроено! AI-ассистент будет использовать ваш GPU.\\n"
  elif [[ "${has_amd_gpu}" == 'true' ]]; then
    echo -e "${GREEN}#${RESET} Ускорение GPU будет включено (AMD/ROCm) при установке AI-ассистента через дашборд.\\n"
  else
    echo -e "${YELLOW}#${RESET} Ускорение GPU не обнаружено. AI-ассистент будет работать только на CPU.\\n"
    if command -v nvidia-smi &> /dev/null && ! docker info 2>/dev/null | grep -q "nvidia"; then
      echo -e "${YELLOW}#${RESET} Подсказка: GPU обнаружен, но runtime Docker не настроен.\\n"
      echo -e "${YELLOW}#${RESET} Попробуйте перезапустить Docker: ${WHITE_R}sudo systemctl restart docker${RESET}\\n"
    fi
  fi
}

success_message() {
  echo -e "${GREEN}#${RESET} Установка Project NOMAD успешно завершена!\\n"
  echo -e "${GREEN}#${RESET} Файлы установки находятся в /opt/project-nomad\\n\\n"
  echo -e "${GREEN}#${RESET} Командный центр Project NOMAD будет автоматически запускаться при перезагрузке устройства. Однако при необходимости вы всегда можете запустить его вручную: ${WHITE_R}${NOMAD_DIR}/start_nomad.sh${RESET}\\n"
  echo -e "${GREEN}#${RESET} Теперь вы можете получить доступ к интерфейсу управления по адресу http://localhost:8080 или http://${local_ip_address}:8080\\n"
  echo -e "${GREEN}#${RESET} Спасибо за поддержку Project NOMAD!\\n"
}

###################################################################################################################################################################################################
#                                                                                                                                                                                                 #
#                                                                                          Главный скрипт                                                                                          #
#                                                                                                                                                                                                 #
###################################################################################################################################################################################################

# Предварительные проверки
check_is_debian_based
check_is_x86_64
check_is_bash
check_has_sudo
ensure_dependencies_installed
check_is_debug_mode

# Основная установка
get_install_confirmation
accept_terms
ensure_docker_installed
check_docker_compose
setup_nvidia_container_toolkit
get_local_ip
create_nomad_directory
copy_helper_scripts
copy_management_compose_file
start_management_containers
verify_gpu_setup
success_message

# free_space_check() {
#   if [[ "$(df -B1 / | awk 'NR==2{print $4}')" -le '5368709120' ]]; then
#     header_red
#     echo -e "${YELLOW}#${RESET} У вас только $(df -B1 / | awk 'NR==2{print $4}' | awk '{ split( "B KB MB GB TB PB EB ZB YB" , v ); s=1; while( $1>1024 && s<9 ){ $1/=1024; s++ } printf "%.1f %s", $1, v[s] }') свободного места на \"/\"... \\n"
#     while true; do
#       read -rp $'\033[39m#\033[0m Хотите продолжить выполнение скрипта? (y/N) ' yes_no
#       case "$yes_no" in
#          [Nn]*|"")
#             free_space_check_response="Отменить скрипт"
#             free_space_check_date="$(date +%s)"
#             echo -e "${YELLOW}#${RESET} ОК... Пожалуйста, освободите место перед повторным запуском скрипта..."
#             cancel_script
#             break;;
#          [Yy]*)
#             free_space_check_response="Продолжить на свой страх и риск"
#             free_space_check_date="$(date +%s)"
#             echo -e "${YELLOW}#${RESET} ОК... Продолжаем выполнение скрипта... обратите внимание, что из-за нехватки места могут возникнуть ошибки... \\n"; sleep 10
#             break;;
#          *) echo -e "\\n${RED}#${RESET} Некорректный ввод, пожалуйста, ответьте Yes или No (y/n)...\\n"; sleep 3;;
#       esac
#     done
#     if [[ -n "$(command -v jq)" ]]; then
#       if [[ "$(dpkg-query --showformat='${version}' --show jq 2> /dev/null | sed -e 's/.*://' -e 's/-.*//g' -e 's/[^0-9.]//g' -e 's/\.//g' | sort -V | tail -n1)" -ge "16" && -e "${eus_dir}/db/db.json" ]]; then
#         jq '.scripts."'"${script_name}"'" += {"warnings": {"low-free-disk-space": {"response": "'"${free_space_check_response}"'", "detected-date": "'"${free_space_check_date}"'"}}}' "${eus_dir}/db/db.json" > "${eus_dir}/db/db.json.tmp" 2>> "${eus_dir}/logs/eus-database-management.log"
#       else
#         jq '.scripts."'"${script_name}"'" = (.scripts."'"${script_name}"'" | . + {"warnings": {"low-free-disk-space": {"response": "'"${free_space_check_response}"'", "detected-date": "'"${free_space_check_date}"'"}}})' "${eus_dir}/db/db.json" > "${eus_dir}/db/db.json.tmp" 2>> "${eus_dir}/logs/eus-database-management.log"
#       fi
#       eus_database_move
#     fi
#   fi
# }
