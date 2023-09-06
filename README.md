# TAPY

## Описание

TAPY - Test API with YAML

## Примеры

Примеры использования можно посмотреть в папке /test

## API

Каждый файл может содержать зависимости. Перед стартом будет построен граф и выполнение пойдет в топологическом порядке

```yaml
depends_on:
  - auth
```

Каждый файл и каждый шаг может содержать следующие настройки:

```yaml
root: https://jsonplaceholder.typicode.com # переустановать root
vars: # назначить переменные
  testKey: TEST${$makeAlphaId(5).toUpperCase()}
headers: # установаить заголовки в следующие fetch
  "Authorization": "Bearer ${json.token}"
```

Шаги описываются структурой:

```yaml
# выполняются в самом начале файла
beforeAll:
  - get: url # GET запрос
    ...
steps:
  - post: url # POST запрос
    log: varName/json # вывести в лог переменную varName или json ответ
    body: # тело запроса
      title: title value string
      user_id: 2
    json: varName # сохранить ответ в переменную
    status: 200 # проверить код ответа
    check: # проверить после выполнение запросов
      - json.title === 'title value string'
      - json.user_id === 2
    eval: # выполняет eval в контексте
      - m1.date = "2023-09-25T00:00:00Z"
  - put: url # PUT запрос
    ...
  - get: url # GET запрос
    ...
  - delete: url # DELETE запрос
    ...

# выполняются после всех шагов
afterAll:
  - get: url # GET запрос
    ...

# cleanup выполняется в обратном топологическом порядке даже если тесты не прошли
cleanup:
  - get: url # GET запрос
    ...
```

## Запуск

```
npx rw-tapy --help
npx rw-tapy <options> ./test
```
