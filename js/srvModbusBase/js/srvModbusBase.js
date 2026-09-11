const ClassBaseService_S = require('./../../srvService/js/srvService');
const AsyncQueueProcessor = require('./../../srvUtils/js/AsyncQueueProcessor');
const Modbus = require('modbus-serial');

EVENT_SYSBUS_LIST = ['all-init-stage1-set', 'source-connect', 'all-disconnect'];
const TYPES = ['RTU','TCP','RTUOTCP'];
const SHORT_TYPES = ['rtu', 'tcp', 'rot'];
const DEFAULT_PORT = 502;
const DEFAULT_RATE = 9600;

/** 
 * @typedef {object} ModbusComm
 * @property {Integer} id   - id устройства modbus
 * @property {Integer} com  - номер команды modbus
 * @property {Integer} reg  - номер адресуемого регистра
 * @property {Array} dat    - массив значений для записи
 * @property {Integer} len  - количество регистров при чтении
 */

/**
 * @class
 * @description Класс реализует расширенный функционал низкоуровневой библиотеки modbus-serial. Дополнительно включает поле id устройства, с которым сейчас общается, а также универсальный метод выполнения команд.
 */
class ModbusExtended extends Modbus {
    #_CurrentDevice;
    /**
     * @constructor
     */
    constructor() {
        super();
        this.#_CurrentDevice = -1;
        this._ServeSources = [];
    }

    /**
     * @method
     * @description Выполняет команду modbus
     * @param {ModbusComm} _comm    - команда modbus для выполнения
     * @returns {Promise}           - промис для дальнейшей обработки очереди
     */
    Execute_modbus_command( _comm )
    {
        let _id  = _comm.mbID ?? 1;
        let _com = _comm.id ?? 0x03;
        let _reg = _comm.reg ?? 0;
        let _dat = _comm.dat ?? 0;
        let _len = _comm.len ?? 1;

        if (this.#_CurrentDevice != _id) {
            this.setID( _id );
            this.#_CurrentDevice = _id;
        }

        return new Promise((res,rej) => {
            switch (_com) {
                case 0x01: // Чтение DO (Coils)
                    this.readCoils(_reg, _len)
                    .then((data) => {
                        res({data: data.data.slice(0, _len).map(v => v ? 1 : 0), buffer: new Int16Array(_dat).buffer});
                    })
                    .catch((err) => {
                        rej(err);
                    })
                    break;
                case 0x02: // Чтение DI (Discrete Input)
                    this.readDiscreteInputs(_reg, _len)
                    .then((data) => {
                        res(data);
                    })
                    .catch((err) => {
                        rej(err);
                    })
                    break;
                case 0x03: // Чтение AO (Holding Registers)
                    this.readHoldingRegisters(_reg, _len)
                    .then((data) => {
                        res(data);
                    })
                    .catch((err) => {
                        rej(err);
                    })
                    break;
                case 0x04: // Чтение AI (Analog Inputs)
                    this.readInputRegisters(_reg, _len)
                    .then((data) => {
                        res(data);
                    })
                    .catch((err) => {
                        rej(err);
                    })
                    break;
                case 0x05: // Запись одного DO
                    this.writeCoil(_reg, _dat)
                    .then(() => {
                        res({data: [_dat], buffer: new Int16Array(_dat).buffer});
                    })
                    .catch((err) => {
                        rej(err);
                    })
                    break;
                case 0x06: // Запись одного AO
                    this.writeRegister(_reg, _dat)
                    .then(() => {
                        res({data: [_dat], buffer: new Int16Array(_dat).buffer});
                    })
                    .catch((err) => {
                        rej(err);
                    })
                    break;
                case 0x0F: // Запись нескольких DO
                    this.writeCoils(_reg, _dat)
                    .then(() => {
                        res({data: _dat, buffer: new Int16Array(_dat).buffer});
                    })
                    .catch((err) => {
                        rej(err);
                    })
                    break;
                case 0x10: // Запись нескольких AO
                    this.writeRegisters(_reg, _dat)
                    .then(() => {
                        res({data: _dat, buffer: new Int16Array(_dat).buffer});
                    })
                    .catch((err) => {
                        rej(err);
                    })
                    break;            
                default:
                    rej(`Unsupported command: ${_com}`);
                    break;
            }
        })
    }

    destroy() {
        try {
            super.destroy();
        }
        catch (e) {
            this.close();
        }
    }
    
}

/**
 * @class
 * @description Класс реализует функционал для работы с источниками по протоколу modbus. Поддерживает три среды передачи сообщений: RTU, TCP и RTU over TCP (RTUOTCP).
 */
class ModbusBase extends ClassBaseService_S {
    #_Type; // Тип протокола modbus
    #_PrimaryBus;
    #_Sources;
    #_AddingSource;
    #_SourceQueue;
    /**
     * @constructor
     * @description
     * Конструктор класса ModbusBase
     * @param {[ClassBus_S]} _busList - список шин, созданных в проекте
     */
    constructor({ _name, _busNameList, _busList, _node, _type }) {
        super({ _name: _name, _busNameList: _busNameList, _busList, _node });
        this.#_Type = _type.toUpperCase();
        this.#_PrimaryBus = _busNameList[1];
        this.#_AddingSource = false;
        this.#_SourceQueue = [];
        this.#_Sources = {};

        if (!TYPES.includes(this.#_Type)) {
            this.EmitEvents_logger_log({level: 'W', msg: `Unsupported modbus client type: ${this.#_Type}\nDefaulting to TCP`});
            this.#_Type = "TCP";
        };

        const event_list = [`modbusclient${SHORT_TYPES[TYPES.indexOf(this.#_Type)]}-send`, 'modbus-source-toss', 'enqueue-command'];

        this.FillEventOnList ('sysBus', EVENT_SYSBUS_LIST);
        this.FillEventOnList (this.#_PrimaryBus, event_list);
        this.EmitEvents_logger_log({level: 'I', msg: `Modbus Client ${this.#_Type} initialized.`});
    }

    /**
     * @getter
     * @description Тип соединения modbus
     */
    get Type() {
        return this.#_Type;
    }

    /**
     * @getter
     * @description Привязанные источники modbus
     */
    get Sources() {
        return this.#_Sources;
    }

    /**
     * @method
     * @description Обработчик события, запускает подключение к источникам
     * @param {String} _topic       - топик сообщения 
     * @param {Object} _msg         - само сообщение
     */
    HandlerEvents_source_connect( _topic, _msg ) {
        this.EmitEvents_logger_log({level: 'I', msg: `Connection for Modbus${this.#_Type} starting`});
        this.Connect();
    }

    /**
     * @method
     * @description Обработчик события, закрывает все существующие сокеты
     * @param {String} _topic       - топик сообщения 
     * @param {Object} _msg         - само сообщение
     */
    HandlerEvents_all_disconnect(_topic, _msg) {
        Object.values(this.#_Sources).forEach(source => {
            source.Groups.forEach((group) => {
                if (group.intervalObject) {
                    clearInterval(group.intervalObject);
                }                
            });
            source.Modbus.client.destroy();
        });
    }

    /**
     * @method
     * @description Обработчик события, запускает подключение к источникам
     * @param {String} _topic       - топик сообщения 
     * @param {Object} _msg         - само сообщение
     */
    HandlerEvents_modbus_source_toss( _topic, _msg ) {
        const [conductor] = _msg.arg;
        const [src] = _msg.value;

        this.Add_new_source (src, conductor);
    }

    /**
     * @method
     * @description Перенаправляет команды с других служб на источкик modbus
     * @param {String} _topic       - топик сообщения 
     * @param {Object} _msg         - само сообщение
     */
    HandlerEvents_enqueue_command(_topic, _msg) {
        const [srcName] = _msg.arg;
        const [comm] = _msg.value;

        try {
            this.Queue_client_command(srcName, comm);
        }
        catch (e) {
            this.EmitEvents_logger_log({level: 'W', msg: `Failed to send command via modbus ${this.#_Type} protocol: ${e.message}`, obj: {exception: e.toString()}});
        }
    }

    /**
     * @method
     * @description Запускает событие для передачи сообщения на соответствующую прокси службу
     * @returns msg         - отправляемое сообщение
     */
    EmitEvents_proxymodbus_msg_get( { arg, value } ) {
        const conductor = this.#_Sources[arg[0]].Modbus.conductor;
        const msg = {
            dest: conductor.dest,
            com: conductor.com,
            arg,
            value
        };

        this.EmitMsg(this.#_PrimaryBus, msg.com, msg);
    }

    /**
     * @method
     * @description Посылает команду актуатору указанному источнику
     * @param {String} _sourceName          - имя источника - актуатора 
     * @param {Number} _channelNum          - номер канала, соответствующий актуатору
     * @param {Number} _value               - значение, которое нужно присвоить 
     */
    Modbus_client_send( _sourceName, _channelNum, _value ) {
        try {
            const Registers = {
                'Coil' : 0x05,
                'holdReg': 0x06,
                'Coils' : 0x0F,
                'holdRegs': 0x10
            };

            if (this.#_Sources[_sourceName].Groups == undefined &&
                    this.#_Sources[source_name].Groups.length == 0)
                throw `No specified channel groups for ${_sourceName}`;

            let dest_group = this.#_Sources[_sourceName].Groups.find(group => group.beh == 'Actuator' && _channelNum >= group.startReg && _channelNum <= group.startReg + group.numRegs);
            if (dest_group === undefined)
                throw `Cannot find channel '${_channelNum}' in configuration of ${source_name}`;            

            let comm = {
                id: Registers[dest_group.type],
                reg: _channelNum,
                len: 0,
                dat: val,
                mbID: dest_group.mbID
            };

            this.Queue_client_command(_sourceName, comm);
        }
        catch (e) {
            this.EmitEvents_logger_log({level: 'W', msg: `Failed to send command via modbus protocol: ${e.message}`, obj: {exception: e.toString()}});
        }
    }

    /**
     * @method
     * @description Метод выполняется при обработке команды менеджером очередей
     * @param {String} _error       - сообщение об ошибке 
     * @param {Array} _data         - полученные с источника данные
     * @param {Object} _task        - объект, содержащий выполненную команду, и информацию об источнике
     */
    On_command_response( _error, _data, _task) {
        if (_task == undefined) {
            this.EmitEvents_logger_log({level: 'E', msg: `Modbus error: ${_error}`});
        }
        else if (_error) {
            const source = this.#_Sources[_task.source];
            switch (_error) {
                case 1: 
                    this.EmitEvents_logger_log({level: 'E', msg: `Max fail count for ${_task.source} reached. Closing ${source.IP ?? source.Serial}`, obj: _task.comm});
                    break;
                case 2:
                    this.EmitEvents_logger_log({level: 'E', msg: `Timeout. No response from ${_task.source}(${source.IP ?? source.Serial}:${source.Port ?? source.Baudrate}@${_task.comm.mbID})`, obj: _task.comm});
                    break;
                default:
                    this.EmitEvents_logger_log({level: 'E', msg: `Error sending modbus command to ${_task.source}(${source.IP ?? source.Serial}:${source.Port ?? source.Baudrate}@${_task.comm.mbID}). Reason: ${_error}`, obj: _task.comm});
                    break;
            }
        }
        else {
            this.EmitEvents_proxymodbus_msg_get({arg: [_task.source, _task.comm], value: [_data]});
        }
    }

    /**
     * @method
     * @description Создаёт объект клиента modbus по указанному типу и подключает его по указанным параметрам
     * @param {Object} _source      - объект настроек, содержит COM-порт и бодрейт для RTU соединений, или IP-адрес и порт для TCP и RTUOTCP 
     * @returns {Object} client     - объект клиента modbus-serial
     */
    Initialize_modbus_client( _source ) {
        let client = new ModbusExtended();
        let error = false;

        client._ServeSources.push( _source.Name );
        
        try {
            switch (this.#_Type) {
                case "RTU":
                    if (_source.Serial != null && _source.Baudrate != null) {
                        client.connectRTU(_source.Serial, {baudRate: _source.Baudrate});

                        client._port.on('open', () => {
                            client._ServeSources.forEach (source => {
                                if (!this.#_Sources[source].IsConnected) {
                                    this.#_Sources[source].IsConnected = true;
                                    this.EmitEvents_logger_log({level: 'I', msg: `Source ${source} connected.`});
                                }                    
                            })
                        });

                        client._port.on('close', () => {
                            client._ServeSources.forEach (source => {
                                if (this.#_Sources[source].IsConnected) {
                                    this.#_Sources[source].IsConnected = false;
                                    this.EmitEvents_logger_log({level: 'I', msg: `Source ${source} disconnected.`});
                                    this.#_Sources[source].Modbus.client = undefined;
                                    this.#_Sources[source].Modbus.queueProcessor = undefined;

                                    this.Try_reconnect( client._ServeSources );
                                }                    
                            })
                        });
                    }
                    else {
                        error = true;
                        this.EmitEvents_logger_log({level: 'W', msg: `Cannot create Modbus RTU cleint. Wrong options for: ${_source.Name}. Specify serial and baudrate!`});
                    }
                    break;
                case "TCP":
                    if (_source.IP != null && _source.Port != null) {
                        client.connectTCP(_source.IP, { port: _source.Port });
                        client._port._client.setKeepAlive(true, 0);

                        client._port._client.on('connect', () => {
                            client._ServeSources.forEach (source => {
                                if (!this.#_Sources[source].IsConnected) {
                                    this.#_Sources[source].IsConnected = true;
                                    this.EmitEvents_logger_log({level: 'I', msg: `Source ${source} connected.`});
                                }                    
                            })
                        });

                        client._port._client.on('close', () => {
                            client._ServeSources.forEach (source => {
                                if (this.#_Sources[source].IsConnected) {
                                    this.#_Sources[source].IsConnected = false;
                                    this.EmitEvents_logger_log({level: 'I', msg: `Source ${source} disconnected.`});
                                    this.#_Sources[source].Modbus.client = undefined;
                                    this.#_Sources[source].Modbus.queueProcessor = undefined;

                                    this.Try_reconnect( client._ServeSources );
                                }                    
                            })
                        });
                    }
                    else {
                        error = true;
                        this.EmitEvents_logger_log({level: 'W', msg: `Cannot create Modbus TCP cleint. Wrong options for: ${_source.Name}. Specify ip and port!`});
                    }
                    break;
                case "RTUOTCP":
                    if (_source.IP != null && _source.Port != null) {
                        client.connectTelnet(_source.IP, { port: _source.Port });
                        client._port._client.setKeepAlive(true, 0);

                        client._port._client.on('connect', () => {
                            client._ServeSources.forEach (source => {
                                if (!this.#_Sources[source].IsConnected) {
                                    this.#_Sources[source].IsConnected = true;
                                    this.EmitEvents_logger_log({level: 'I', msg: `Source ${source} connected.`});
                                }                    
                            })
                        });

                        client._port._client.on('close', () => {
                            client._ServeSources.forEach (source => {
                                if (this.#_Sources[source].IsConnected) {
                                    this.#_Sources[source].IsConnected = false;
                                    this.EmitEvents_logger_log({level: 'I', msg: `Source ${source} disconnected.`});
                                    this.#_Sources[source].Modbus.client = undefined;
                                    this.#_Sources[source].Modbus.queueProcessor = undefined;

                                    this.Try_reconnect( client._ServeSources );
                                }                    
                            })
                        });
                    }
                    else {
                        error = true;
                        this.EmitEvents_logger_log({level: 'W', msg: `Cannot create Modbus RTUOTCP cleint. Wrong options for: ${_source.Name}. Specify ip and port!`});
                    }
                    break;
                default:
                    error = true;
                    this.EmitEvents_logger_log({level: 'W', msg: `Unknown modbus client type: ${this.#_Type}`});
                    break;
            }
        }
        catch (e) {
            error = true;
            this.EmitEvents_logger_log({level: 'W', msg: `Error creating Modbus ${this.#_Type} cleint. Message: ${e.message}`});
        }

        if (error) {
            console.log(error, client);
            return undefined;
        }
        else return client;
    }

    /**
     * @method
     * @description Попытка установить новое соединение
     * @param {ModbusExtended} _client      - клиент с разорванным соединением
     */
    Try_reconnect( _sources ) {
        let retry = setInterval(() => {
            this.EmitEvents_logger_log({level: 'I', msg: `Attempt to reconnect to [${_sources}]`});
            let _qProcessor;
            let fresh = this.Initialize_modbus_client(this.#_Sources[_sources[0]]);

            if (fresh != undefined) {
                clearInterval(retry);
                let delay = 0;
                if (this.#_Type == "RTU") {
                    delay = 15;
                }

                _qProcessor = new AsyncQueueProcessor(fresh.Execute_modbus_command.bind(fresh), this.On_command_response.bind(this), 200, 10, delay);
                fresh._ServeSources = _sources;

                fresh._ServeSources.forEach(source => {
                    this.#_Sources[source].Modbus.queueProcessor = _qProcessor;
                    this.#_Sources[source].Modbus.client = fresh;
                });
            }
            else {
                this.EmitEvents_logger_log({level: 'I', msg: `Reconnect unsuccessful`});
            }
        }, 30000);
    }

    /**
     * @method
     * @description Добавляет источник modbus во внутренний список службы для мониторинга отправки сообщений
     * @param {Object} _source      - объект источника по стандарту Horizon Framework 
     * @param {String} _conductor   - какая служба будет использовать этот источник
     */
    Add_new_source ( _source, _conductor ) {
        if (this.#_AddingSource) {
            this.#_SourceQueue.push([_source, _conductor]);
            return;
        }
        this.#_AddingSource = true;

        const SourceName = _source.Name;

        let _client, _usedSource, _qProcessor;

        if (this.#_Type === "TCP" || this.#_Type === "RTUOTCP") {
            _usedSource = Object.values(this.#_Sources).find(source => 
                (source.IP == _source.IP && source.Port == _source.Port)
            );
        }
        else if (this.#_Type === "RTU") {
            _usedSource = Object.values(this.#_Sources).find(source => 
                (source.Serial == _source.Serial && source.Baudrate == _source.Baudrate)
            );
        }
        else {
            this.EmitEvents_logger_log({level: 'E', msg: `Cannot create source ${SourceName}. Unknown type ${this.#_Type}.`, obj: _source});
            this.#_AddingSource = false;
            if (this.#_SourceQueue.length > 0) {
                let [s, c] = this.#_SourceQueue.shift();
                this.Add_new_source (s, c);
            }
            return;
        }

        if (_usedSource == undefined) {
            _client = this.Initialize_modbus_client( _source );
            _qProcessor = new AsyncQueueProcessor(_client.Execute_modbus_command.bind(_client), this.On_command_response.bind(this), 800, 10, 60);
        }
        else {
            _client = _usedSource.Modbus.client;
            _qProcessor = _usedSource.Modbus.queueProcessor;
            _source.IsConnected = _usedSource.IsConnected;
            this.EmitEvents_logger_log({level: 'I', msg: `Source ${SourceName} attached to existing client.`});
            _client._ServeSources.push(SourceName);
        }

        if (_client != undefined) {
            try {
                _source.Modbus = {
                    client: _client,
                    conductor: _conductor,
                    queueProcessor: _qProcessor
                };
                this.#_Sources[SourceName] = _source;
                this.#_AddingSource = false;
                if (this.#_SourceQueue.length > 0) {
                    let [s, c] = this.#_SourceQueue.shift();
                    this.Add_new_source (s, c);
                }
            }
            catch (e) {
                this.EmitEvents_logger_log({level: 'E', msg: `Failed to connect to ${SourceName}`});
                this.#_AddingSource = false;
                if (this.#_SourceQueue.length > 0) {
                    let [s, c] = this.#_SourceQueue.shift();
                    this.Add_new_source (s, c);
                }
            }
        }
        else {
            this.EmitEvents_logger_log({level: 'W', msg: `Failed to connect to ${SourceName}`});
            this.#_AddingSource = false;
            if (this.#_SourceQueue.length > 0) {
                let [s, c] = this.#_SourceQueue.shift();
                this.Add_new_source (s, c);
            }
        }
    }

    /**
     * @method
     * @description Начинает циклический опрос групп каналов по источникам
     */
    Start_sensor_reading() {
        const Registers = {
            'Coil' : 0x01,
            'discInput': 0x02, 
            'holdReg': 0x03, 
            'inputReg': 0x04
        };
        Object.entries(this.#_Sources).forEach(([name, source]) => {
            if (source.Protocol == `modbus${SHORT_TYPES[TYPES.indexOf(this.#_Type)]}`) {
                if (source.Groups != undefined && source.Groups.length > 0) {
                    source.Groups.forEach((group) => {
                        if (group.beh == 'Sensor') {
                            group.comID = Registers[group.type ?? 2];
                            group.intervalObject = setInterval(() => {
                                let comm = {
                                    id: group.comID,
                                    reg: group.startReg ?? 1,
                                    len: group.numRegs ?? 1,
                                    dat: 0,
                                    mbID: group.mbID ?? 1
                                }

                                if (source.IsConnected) {
                                    this.Queue_client_command(name, comm);
                                }
                            },group.interval);
                        }                   
                    })
                }
            }
        })
    }

    /**
     * @method
     * @description Инициализирует соединение с источниками
     */
    Connect() {
        // Переопределение в наследнике
    }

    /**
     * @method
     * @description Формирует очередь команд modbus для индивидуального клиена
     * @param {String} _name        - имя источника
     * @param {Object} _comm        - объект, содержащий данные об исполняемой команде 
     * @returns 
     */
    Queue_client_command( _name, _comm ) {
        let source = this.#_Sources[_name];
        
        if (!source.IsConnected) {
            this.EmitEvents_logger_log({level: 'E', msg: `Cannot queue command to ${_name}. Source disconnected`});
            return;
        }

        if (source) {
            let queueProcessor = source.Modbus.queueProcessor;
            
            /*if (source.Port == 10001)
                console.log(queueProcessor.Size);*/

            if (queueProcessor) {
                let task = {
                    comm: _comm,
                    source: _name
                };

                let result = queueProcessor.Enqueue(task);

                if (!result) {
                    source.Modbus.client.destroy();
                }
            }
            else {
                this.EmitEvents_logger_log({level: 'E', msg: `Queue processor is not defined for ${_name}`});
            }
        }
        else {
            this.EmitEvents_logger_log({level: 'E', msg: `Cannot find source ${_name}`});
        }
    }
}

module.exports = ModbusBase;