# Примеры

Импортируйте `workflow.json` в n8n. В контейнере из [`docker/docker-compose.yml`](../docker/docker-compose.yml) этот каталог смонтирован как `/data/scripts`.

## OneScript: simple

[workflow.json](onescript/workflow.json). Режим «Код в ноде».

Вход: `{ "name": "Стул" }`. Сценарий печатает `ВходящиеДанные` обратно. Выход: тот же item.

Файл для режима «Файл на диске»: [echo-items.os](onescript/echo-items.os), путь `/data/scripts/onescript/echo-items.os`.

## OneScript: command

[workflow.json](onescript-command/workflow.json). Режим «Текст в команде»: тот же сценарий уходит в `oscript -c`. Вход и выход те же, что у simple.

## OneScript Autumn: код

[workflow.json](onescript-autumn-inline/workflow.json). Режим «Код в ноде». В редакторе класс с `&Желудь` и методом `Обработать`. Каждый запуск — новый процесс. К item добавляется `via: "autumn"`.

## OneScript Autumn: simple

[workflow.json](onescript-autumn/workflow.json). Режим «Приложение Осени».

| | |
|---|---|
| Каталог | `/data/scripts/onescript-autumn` |
| Желудь | `Эхо` |

Возвращает items без изменений. Вход: `{ "name": "Стул" }`.

## OneScript Autumn: расчёт заказа

[workflow.json](onescript-autumn-order/workflow.json). Один желудь считает строки заказа. Цена строки уже включает НДС 22%.

| | |
|---|---|
| Каталог | `/data/scripts/onescript-autumn-order` |
| Желудь | `РасчетЗаказа` |

Заказ A-1042: стул 2 × 4590 − 10% и доставка 350.

| Строка | gross | vat | net |
|---|---:|---:|---:|
| Стул | 8262 | 1489.87 | 6772.13 |
| Доставка | 350 | 63.11 | 286.89 |
| Итого | 8612 | 1552.98 | 7059.02 |

## OneScript Autumn: корзина

[workflow.json](onescript-autumn-cart/workflow.json). Один узел, желудь `РасчетКорзины`. Ставка 22% и порог бесплатной доставки 5000 ₽ берёт желудь `ПравилаМагазина`.

| | |
|---|---|
| Каталог | `/data/scripts/onescript-autumn-cart` |
| Желудь | `РасчетКорзины` |

Товар: цена уже с НДС. Услуга: цена без НДС, НДС сверху. Доставка бесплатна, если сумма товаров не ниже порога.

Заказ B-77: стул 8262, сборка 1000 без НДС, доставка 350. Доставка бесплатная.

| Строка | branch | gross | vat | net |
|---|---|---:|---:|---:|
| Стул | goods | 8262 | 1489.87 | 6772.13 |
| Сборка | service | 1220 | 220 | 1000 |
| Доставка | delivery-free | 0 | 0 | 0 |
| Итого | | 9482 | 1709.87 | 7772.13 |

## OneScript Autumn: ветки

[workflow.json](onescript-autumn-branches/workflow.json). Тот же заказ B-77 и те же суммы. На схеме отдельные узлы: разбор, Switch по типу строки, товар, услуга, доставка, сборка, итог.

| Узел | Желудь |
|---|---|
| Разбор | `РазборКорзины` |
| Товар | `РасчетТовара` |
| Услуга | `РасчетУслуги` |
| Доставка | `РасчетДоставки` |
| Итог | `ИтогКорзины` |

Каталог всех узлов: `/data/scripts/onescript-autumn-branches`.
