const ClassBus = require('events').EventEmitter;

/**
 * @constant
 * Таймаут проверки Process запущенных служб
 */
const PROCESS_CHECK_TIMEOUT = 2000;
/**
 * @constant
 * Таймаут перед тем, как Process возбудит событие register
 */
const PROCESS_BUS_TIMEOUT = 1000;

class Source {
    constructor(id, dns, expectName, type, ip, port, MAC, chExpected) {
        this.ID = id;
        this.ExpectName = expectName;
        this.OriginName = "";
        this.Type = type;
        this.DNS = dns;
        this.IP = ip;
        this.Port = port;
        this.MAC = MAC;
        this.IndSrc = -1;
        this.ChExpected = chExpected;
        this.ChFactual = 0;
        this.IsConnected = false;
        this.CheckProcess = false;
        this.CheckClient = false;
        this.CheckDM = false;
    }
}

class Sources {
    constructor() {
        this._collection = [];
    }
    SetConnectionFlagTrue(_cIndex) {
        this._collection[_cIndex].IsConnected = true;
    }
    SetConnectionFlagFalse(_cIndex) {
        this._collection[_cIndex].IsConnected = false;
    }
    GetConnectionKey(_cIndex) {
        return this._collection[_cIndex].IndSrc;
    }
    SetConnectionKey(_cIndex, _sIndex) {
        this._collection[_cIndex].IndSrc = _sIndex;
    }
    GetNameByKey(_key) {
        let index = this._collection.findIndex((element) => element.IndSrc == _key);
        return this._collection[index].ExpectName;
    }
}

class Service {
    constructor(serviceName, importance) {
        this.ServiceName = serviceName;
        this.Importance = importance;
        this.Error = "";
        this.Status = "Stopped";
    }
    #_object;
    get object() {
        return this.#_object;
    }

    set object(_obj) {
        this.#_object = _obj;
    }
}

class Services {
    constructor() {
        this._collection = [];
        this.SetServiceObject = this.SetServiceObject.bind(this);
    }
    SetServiceObject(_name, _obj) {
        let index = this._collection.findIndex((element) => element.ServiceName == _name);
        if (index != -1) {
            this._collection[index].object = _obj;
            this._collection[index].Status = "Running";
        }
    }
    GetServiceObject(_name) {
        let index = this._collection.findIndex((element) => element.ServiceName == _name);

        if (index != -1) {
            return this._collection[index].object;
        }
        else {
            return undefined;
        }
    }
    SetServiceError(_name, _err) {
        let index = this._collection.findIndex((element) => element.ServiceName == _name);

        if (index != -1) {
            this._collection[index].Error = _err;
        }
    }
    GetServiceError(_name) {
        let index = this._collection.findIndex((element) => element.ServiceName == _name);

        if (index != -1) {
            return this._collection[index].Error;
        }
    }
}

/**
 * @class
 * @description
 * Класс реализует функционал Process - службы, отвечающий за мониторинг запуска фреймворка,
 * создания шин и служебных контейнеров
 */
class ProcessSrv {
    #_SourcesState;
    #_ServicesState;

    /**
     * @constructor
     * Конструктор класса
     */
    constructor() {
        //реализация паттерна синглтон
        if (this.Instance) {
            return this.Instance;
        } else {
            ProcessSrv.prototype.Instance = this;
        }
        // Создание шин
        this._sysBus = new ClassBus();
        this._sysBus.Name = "sysBus";
        this._logBus = new ClassBus();
        this._logBus.Name = "logBus";
        this._mdbBus = new ClassBus();
        this._mdbBus.Name = "mdbBus";
        this._dataBus = new ClassBus();
        this._dataBus.Name = "dataBus";
    }
    /**
     * @method
     * @description
     * Инициализирует работу Process. Создаёт объект, создаёт критически
     * необходимые шины и подписывает на необходимые события
     */
    Init() {
        this._sysBus.on('ws-addr-fail', () => {
            this._logBus.emit('logError', "Failed to connect to anyone via WebSocket!");
        });
        this._sysBus.on('ws-addr-done', () => {
            let arr = [];
            this.#_SourcesState._collection.forEach((connection) => {
                if (connection._isConnected == 1) {
                    arr.push(connection._sourceName)
                }
            });
            this._sysBus.emit('proc-connections-done', this._SourcesState);
        });
        return { sysBus: this._sysBus, logBus: this._logBus, mdbBus: this._mdbBus, dataBus: this._dataBus };
    }
    /**
     * @method
     * @description
     * Заполняет служебные контейнеры по полученным из БД массивам источников и служб
     * @param {Array} _data0    - массив источников
     * @param {Array} _data1    - массив служб 
     */
    Fill(_data0, _data1) {
        // TODO: добавить создание необязательных шин
        this.#_SourcesState = new Sources();
        _data0.forEach(connection => {
            if (connection.IP == "" && connection.DNS == "") {
                console.log("Unacceptable connection at ID: " + connection.ID);
            }
            else {
                this.#_SourcesState._collection.push(new Source(connection.ID, connection.DNS, connection.ExpectName, connection.Type, connection.IP, connection.Port, "", connection.ChExpected));
            }
        });

        this.#_ServicesState = new Services();
        _data1.forEach(service => {
            this.#_ServicesState._collection.push(new Service(service.ServiceName, service.Importance));
        });
        this.#_ServicesState.SetServiceObject('Process', this);
        
        // Ждём, тогда создадутся службы
        setTimeout(() => {
            this._logBus.emit('logInfo', "Lists are formed!");
            this._sysBus.emit('register', this._ServicesState);// отсылаем
            setTimeout(() => {// ждём 3 секунды на проверку служб
                let arr = [];
                this.#_ServicesState._collection.forEach(service => {
                    if (service.Importance == 'Critical' && service.Status == 'Stopped') {
                        arr.push(service.ServiceName);
                    }
                });
                if (arr.length > 0) {
                    this.#_ServicesState.SetServiceError('Process', "Critical");
                    this._logBus.emit('logWarn', "Uninitialized critical: " + arr);
                }
                else {
                    this._logBus.emit('logInfo', "All services are up!");
                }
            }, PROCESS_CHECK_TIMEOUT);
        }, PROCESS_BUS_TIMEOUT);
    }
    /**
     * @method
     * @description Запуск подключений к источникам
     */
    Run() {
        // Генерация события для каждого клиента - сигнал, что объект с подключениями готов
        if (this.#_ServicesState.GetServiceError('Process') == "") {
            this.GetSourceClients().forEach(source => {
                this._sysBus.emit(source.genEvent, this._SourcesState);
            });
        }
        else {
            this._logBus.emit('logWarn', "Cannot start connecting! Not all services are up!");
        }
    }
    /* debughome */
    /**
     * @method
     * Возвращает из базы данных список доступных клиентов и имена событий для генерации
     * @returns Array[Object]   sources - массив объектов с описанием клиентов
     */
    GetSourceClients() {// Заглушка
        let sources = [{id: 0, name: "WebSocket", genEvent: "ws-addr-cast"}];
        return sources;
    }
    /* debugend */
    get _SourcesState() {
        return this.#_SourcesState;
    }
    get _ServicesState() {
        return this.#_ServicesState;
    }
}

module.exports = ProcessSrv;