# n8n-nodes-onescript

Community-нода n8n: выполняет [OneScript](https://oscript.io/) через `oscript`.

## Установка

Нужен OneScript 2.x в `PATH` процесса n8n: [установка](https://oscript.io/learn/install). Для режима «Приложение Осени» в том же окружении: `opm install autumn`.

Пакет из npm: **Settings → Community nodes → Install**, имя `n8n-nodes-onescript`.

До публикации укажите собранный каталог и перезапустите n8n:

```bash
npm install
npm run build
export N8N_CUSTOM_EXTENSIONS="/абсолютный/путь/n8n-nodes-onescript/dist"
```

## Docker

Образ уже содержит n8n, `oscript` и пакет `autumn`.

```bash
npm run build
docker compose -f docker/docker-compose.yml up --build
```

Интерфейс: http://localhost:5678. Каталог `examples` смонтирован как `/data/scripts`.

## Режимы

Нода выполняется один раз на все входящие items. В скрипт попадает поле `json`.

| Режим | Запуск |
|---|---|
| Код в ноде | Текст из редактора |
| Текст в команде | Тот же текст в `oscript -c` |
| Файл на диске | Файл `.os` |
| Приложение Осени | Каталог приложения, один процесс `oscript`, метод `Обработать` |

Если передача items включена, путь к JSON — `АргументыКоманднойСтроки[0]`. В режимах «Код в ноде» и «Текст в команде» он уже прочитан в `ВходящиеДанные`. Объекты JSON читаются в `Соответствие`.

Если stdout — один JSON-массив, каждый элемент становится item. Объект вида `{ "json": { ... } }` возвращается как item. Иначе один item `{ "stdout", "stderr", "exitCode" }`.

Примеры: [examples/README.md](examples/README.md).

## Ограничения

- Нужен self-hosted n8n. У пакета `n8n.strict: false`.
- Код выполняется с правами процесса n8n.

## Автор и поддержка

Автор: Ivan Karlo (<i.karlo@outlook.com>)

- [Boosty](https://boosty.to/1carlo/donate)
- [Чаевые](https://pay.cloudtips.ru/p/d752cb43)

[![Infostart](https://infostart.ru/bitrix/templates/sandbox_empty/assets/tpl/abo/img/logo.svg)](https://infostart.ru/1c/articles/2814642/)

Публикация на Infostart: [Как начать использовать n8n, если вы из мира 1С](https://infostart.ru/1c/articles/2814642/)
