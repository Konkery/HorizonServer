<div style="font-family: 'Open Sans', sans-serif; font-size: 16px">

# ClassBusMsg_S
<div style="color: #555">
    <p align="center">
    <img src="./res/logo.png" width="400" title="hover text">
    </p>
</div>

## Лицензия
// Укажите информацию о лицензии здесь.

### Описание
<div style="color: #555">

**ClassBusMsg_S** — это класс, предназначенный для формирования сообщений, передаваемых по шинам фреймворка Horizon. 
Он обеспечивает унификацию содержимого пакетов, проверку вх. данных и присвоение метаданных сообщения, таких как `timestamp` и `hash`.

Класс поддерживает следующие классы сообщений:

- `type: req/res` - сообщение запрос/ответ;
- `demandRes: <true/false>` - сообщение требует / не требует ответ.

Для направления запросов требующих ответа (`demandRed === true`) на контроллер Horizon, используется поле `resCom`. 
Оно предназначено для указания имени команды с контроллера, которая будет считаться ответом на запрос.

Предполагается, что сообщения отправляются только службами, реализующими **ClassBaseService_S** и имеющими для этого набор специализированных методов.  

</div>

### Поля
<div style="color: #555">

- timestamp — временная метка создания сообщения;
- metadata — объект, содержащий метаданные сообщения:
  - hash — хэш сообщения;
  - type — тип сообщения (запрос или ответ);
  - demandRes — флаг, указывающий, требуется ли ответ;
  - resCom — команда ответа;
  - source — источник сообщения;
  - dest — получатель сообщения.
- com — команда сообщения;
- arg — массив аргументов сообщения;
- value — основные данные, передающиеся в сообщении; Всегда массив.

</div>

### Конструктор
<div style="color: #555">

- _msg — объект, содержащий параметры сообщения:
```js
/**
 * @typedef TypeBusMsgConstructor
 * @property {string} com
 * @property {[any]} arg
 * @property {[any]} value
 * @property {string} source Примечание: source всегда указывается службой, отправляющей сообщение  
 * @property {string} resCom 
 * @property {string} dest
 * @property {boolean} demandRes 
 * @property {string|number} [hash] - хэш сообщения, генерируется автоматически либо передается в конструктор; во втором случае сообщению присваивается type = 'res'
 */
```

</div>

### Методы
<div style="color: #555">

- #GetStrOrErr(key, val) -
Проверяет, является ли значение строкой, и возвращает его, иначе выбрасывает ошибку;

- #GetArrOrErr(key, arr) -
Проверяет, является ли значение массивом, и возвращает его, иначе выбрасывает ошибку;

- #GetType(typeName) -
Проверяет, является ли указанный тип допустимым, и возвращает его.

</div>

### Пример использования
<div style="color: #555">

```js
const msg = {
    dest: 'proxywsc',
    demandRes: true,
    com: 'proxywsc-send',
    arg: ['plc11'],
    value: [msg_to_plc],
};
this.EmitMsg('lhpBus', msg.com, msg, { timeout: 1000 });
```

</div>


</div>

