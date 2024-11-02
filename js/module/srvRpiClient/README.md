<div style="font-family: 'Open Sans', sans-serif; font-size: 16px">

# srvRpiClient

<div style="color: #555">
<p align="center">
<img src="./res/logo.png" width="400" title="hover text">
</p>
</div>

## Лицензия
////

### Описание
**ClassRpiClient_S** реализует функционал службы **rpiclient** серверного фреймворка. Служба предназначена для взаимодействия с функциональными узлами, собирающими данные о хабе на Raspberry Pi. Класс обрабатывает команды на сбор данных с различных каналов хаба (температура, загрузка процессора, свободная память) и передает эти данные в систему.

### Подписки
- 'all-init-stage1-set' - инициализация службы;
- 'rpiclient-msg-get' — обработка входящих сообщений с данными от клиента Raspberry Pi.

### События
- 'proxyrpiclient-msg-get' — отправка сообщения с собранными данными на прокси-сервис для дальнейшей обработки.

### Поля
<div style="color: #555">

- #_Rpi — объект, представляющий клиент Raspberry Pi, от которого поступают данные.
- #_HostName — имя хоста, полученное через команду `hostname`.
- #_ChFuncList — список каналов хаба, привязанных к функциям сбора данных (температура, загрузка процессора, память).

</div>

### Конструктор
<div style="color: #555">

- _busList — список шин, созданных в проекте;
- _node — объект узла;

</div>

### Методы

<div style="color: #555">

- HandlerEvents_all_init_stage1_set(_topic, _msg) — обрабатывает событие инициализации, получает имя хоста и запускает опрос каналов.
  
- HandlerEvents_rpiclient_data_get(_topic, _msg) — принимает данные с каналов хаба и отправляет их на прокси.

- EmitEvents_proxyrpiclient_msg_get({ value, arg }) — отправляет данные на прокси-сервис.

- StartPolling() — запускает циклический опрос каналов Raspberry Pi, получая данные по заданным интервалам.

- GetTmprt() — возвращает значение температуры чипа через выполнение команды `sudo vcgencmd measure_temp`.

- GetCPULoad() — возвращает значение загрузки CPU через выполнение команды `top -d 0.5 -b -n2`.

- GetFreeMem() — возвращает значение свободной памяти через выполнение команды `free | grep Mem`.

</div>

### Пример
```js
const ClassRpiClient_S = require('srvRpiClient');
const rpiclient = new ClassRpiClient_S({ _busList, _node });
```
</div>