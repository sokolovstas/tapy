# TAPY

## Описание

TAPY - Test API with YAML

## Примеры

Примеры использования можно посмотреть в папке /test

## API

Каждый файл и каждый шаг может содержать следующие настройки:

```yaml
root: https://jsonplaceholder.typicode.com # переустановать root
vars: # назначить переменные
  testKey: TEST${$makeAlphaId(5).toUpperCase()}
headers: # установаить заголовки в следующие fetch
  "Authorization": "Bearer ${json.token}"
```

Каждый шаг описывается структурой:

```yaml
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
    - put: url # PUT запрос
      ...
    - get: url # GET запрос
      ...
    - delete: url # DELETE запрос
      ...

```

## Запуск

```
npx rw-tapy ./test
```
