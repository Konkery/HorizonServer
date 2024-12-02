<div style = "font-family: 'Open Sans', sans-serif; font-size: 16px">

# ClassBaseService_S
<div style = "color: #555">
    <p align="center">
    <img src="./res/logo.png" width="400" title="hover text">
    </p>
</div>

## Лицензия
////

### Описание
<div style = "color: #555">

**ClassBaseService_S** – это базовый класс серверной службы фреймворка Horizon. Он реализует идентификацию служб и обеспечивает взаимодействие через два интерфейса: один для работы с внутренними шинами фреймворка Horizon, а другой для интеграции с узлами Node-RED.

Функционал:
- Подписка на события указанной шины (включая Node-RED);
- Базовые обработчики системных событий, таких как 'all-init-stage1-set', 'all-close';
- Реализация паттерна Singleton для предотвращения инициализации служб с повторяющимся именем;
- Формирование и отправка сообщений на шины Horizon и Node-RED.

</div>

### Подписки
<div style = "color: #555">
- 'all-init-stage1-set' - фаза инициализации 1;
- 'all-close' - редеплой Node-RED, который приводит к необходимости обнулить поля объекта.

</div>

### Исходящие сообщения
- 'logger-log' - сообщение на логгер;
Краткий формат сообщения: 
```js
{
    com: 'logger-log',
    arg: ['<log_level>'],
    value: ['<msg>', '<obj>']
}
```

### Поля
<div style = "color: #555">

- static #_ServicesNameList - статическая коллекция доступных имен служб;
- static #_InstancedNameList -  статическая коллекция инициализированных служб;
- #_Name - имя службы;
- #_BusNameList - список имен шин, требуемых службе;
- #_Status - статус службы 'active | inactive';
- #_GlobalBusList - глобальная коллекция инициализированных шин;
- #_Node - объект node;
- #_EventOnList - коллекция всех событий, которые слушает служба по шине (ключ - имя шины);
- #_EventEmitList - коллекция всех событий, которые направляются слушателю (ключ - имя слушателя);
- #_BusHandlerList - объект, хранящий агрегатные обработчики шин;
- #_HandlerFunc - хранит значения типа 'топик события : функция обработчик';
- #_EmitFunc - хранит значения типа 'топик события': функция-emit;
- #_PromiseList - контейнер с промисами, привязанными к запросам;
- #_ServicesState - объект служб;
- #_BusList - объект-коллекция шин, используемых службой.

</div>

### Аксессоры
<div style = "color: #555">

- get Name - Имя службы;

- get BusList - список доступных шин;

- get SourcesState - Объект-список источников. 
Сохраняется  при обработке события 'all-init-stage1-set';

- get ServicesState - Объект-список служб. 
Сохраняется  при обработке события 'all-init-stage1-set'.

</div>

### Методы
<div style = "color: #555">

- FillEventOnList(_busName, ..._topicNames)
  - Добавляет топики для подписки по шине и активирует обработчики;

- CreateBus(_busName)
  - Создает и возвращает объект шины, если метод был вызван службой с соответствующей привилегией;

- EmitMsg(_busName, _topic, _msg, _opts)
  - Отправляет сообщение по шине с возможностью ожидания ответа.

- UpdateBusList()
  - Обновляет коллекцию используемых шин, подтягивая шины из глобальной коллекции;

- CreateMsg(_msgOpts)
  - Создает и возвращает объект сообщения, который будет отправлен через шину;

- EmitEvents_logger_log({ level, msg, obj })
  - Отправляет лог-сообщения в систему логирования через шину.

</div>

### Примеры

#### Конструктор
Предусматривается что именно в конструкторе выполняются подписки на события системных шин.
Остальные действия не регламентируются
```js
/**
 * @constructor
 * @param {[ClassBus_S]} _busList - список шин, созданных в проекте
 * @param {object} _node - объект узла Node-RED
 */
constructor({ _busList, _node }) {
    super({ _name: 'dm', _busNameList: BUS_NAMES_LIST, _busList, _node });
    // подписка на системные события
    this.FillEventOnList('sysBus', EVENT_ON_LIST_SYSBUS);
    // подписка на события шин источников
    this.FillEventOnList('lhpBus', EVENT_ON_LIST_LHPBUS);
    this.FillEventOnList('rpiBus', EVENT_ON_LIST_HUBBUS);
}
```
#### Обработчики
Все обработчики называется в формате `HandlerEvents_имя_топика`; Обработчики всегда принимают 2 аргумента: имя топика и сообщение - объект *ClassBusMsg_S*
В пример приводится HandlerEvents_all_init-stage1-set.
```js
/**
 * @method
 * @description Регистрирует службу в системе, сохраняет информацию об источниках
 * @param {string} _topic - имя топика
 * @param {ClassBusMsg_S} _msg - сообщение
 */
async HandlerEvents_all_init_stage1_set(_topic, _msg) {
    // вызов базового обработчика
    super.HandlerEvents_all_init_stage1_set(_topic, _msg);
    // специфичная логика службы
    ...
}
```

Общая логика обработки запросов, требующего ответа:
1. Срабатывает обработчик
2. Извлекается hash (тут проверка на `demandRes == true` пропущена)
3. Вызывается метод-эмиттер, который отправит ответ. В метаданных ответного сообщения будет ранее полученное хэш-значение.
```js
/**
 * @method
 * @public
 * @description Принимает запрос на получение списка каналов источника
 * @param {string} _topic 
 * @param {ClassBusMsg_S} _msg 
 */
HandlerEvents_proxymqttclient_deviceslist_get(_topic, _msg) {
    const [ source_name ] = _msg.arg;
    const { hash } = _msg.metadata;
    this.EmitEvents_dm_deviceslist_get({ hash });
}
```
#### Эмиттеры
Отправка запроса на получение списка каналов. Ответ ожидается в команде `dm-channels-set` в течении 1000 мсю
**Прим: в таких сценариях может быть важно выполнять return EmitMsg чтобы вернуть и "за-await-ить" промис**
```js
EmitEvents_providermdb_channels_get() {
    const msg = {
        dest: 'providermdb',
        demandRes: true,
        resCom: 'dm-channels-set',
        com: 'providermdb-channels-get',
        arg: [],
        value: []
    }
    return this.EmitMsg('mdbBus', msg.com, msg, { timeout: 1000 });
```
#### Отправка сообщения на логгер
Отправка лога выполняется посредством отправки сообщения на шину logBus, на которой его перехватит соответствующая служба. 
```js
this.EmitEvents_logger_log({ level: 'ERROR', msg: `Failed to create ch`, obj: error_msg? });
```

</div>


