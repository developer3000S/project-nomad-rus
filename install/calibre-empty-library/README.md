# Пустая библиотека Calibre (Calibre-Web seed)

`metadata.db` — это пустая база данных библиотеки Calibre, генерируемая один раз с помощью
`calibredb --with-library <dir> list` (calibre 9.9).

Calibre-Web не может создать библиотеку с нуля. На свежей установке NOMAD она остановится
на странице "Database Configuration", запрашивающую существующую базу данных Calibre. Чтобы избежать этого,
Calibre-Web предварительное действие seed-ит этот файл в `storage/books` (только когда `metadata.db` еще не существует)
и передает владение файлом пользователю контейнера, поэтому пользователь просто указывает Calibre-Web `/books`
однойжды и начинает добавлять книги.

Этот файл упакован в админский образ через Dockerfile и копируется на этапе установки
функцией `DockerService._runPreinstallActions__CalibreWeb()`. Чтобы сгенерировать его заново:

```sh
docker run --rm -v "$PWD/lib:/books" --entrypoint bash lscr.io/linuxserver/calibre:latest \
  -c "calibredb --with-library /books list"
# then copy lib/metadata.db here
```