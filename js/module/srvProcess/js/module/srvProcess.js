const ClassBus = require('events').EventEmitter;

class Source {
    constructor(domainName, sourceName, type, ipAddress, port, MAC, hKey, chCount, isConnected, procMetaData, isSynced, flag4) {
        this._domainName = domainName;
        this._sourceName = sourceName;
        this._type = type;
        this._ipAddress = ipAddress;
        this._port = port;
        this._MAC = MAC;
        this._hKey = hKey;
        this._chCount = chCount;
        this._isConnected = isConnected;
        this._procMetaData = procMetaData;
        this._isSynced = isSynced;
    }
}

class Sources {
    constructor() {
        this._collection = [];
    }
    Init(_data) {
        let arr = this.GetConnections();
        let numServices = arr.length;
        
        for (let i = 0; i < numServices; i++) {
            this._collection[i] = new Source(arr[i].domain, arr[i].source, arr[i].type, arr[i].ip, arr[i].port, "", "", "", 0, 0, 0, 0);
        }
    }
    /**
     * @method
     * Возвращает из базы данных список известных источников
     * @returns Array[Object]   arr - массив объектов с описанием источников
     */
    GetConnections() {// Заглушка
        let arr = [
            {domain: "", source: "PLC11", type: "plc", ip: "192.168.50.151", port: "8080"},
            {domain: "", source: "PLC21", type: "plc", ip: "192.168.50.156", port: "8080"},
            {domain: "", source: "PLC22", type: "plc", ip: "192.168.50.157", port: "8080"},
            {domain: "", source: "PLC31", type: "plc", ip: "192.168.50.161", port: "8080"},
            {domain: "", source: "PLC32", type: "plc", ip: "192.168.50.162", port: "8080"},
        ];
        return arr;
    }
    SetConnectionFlagTrue(_cIndex) {
        this._collection[_cIndex]._isConnected = 1;
    }
    SetConnectionFlagFalse(_cIndex) {
        this._collection[_cIndex]._isConnected = 0;
    }
    GetConnectionKey(_cIndex) {
        return this._collection[_cIndex]._hKey;
    }
    SetConnectionKey(_cIndex, _sIndex) {
        this._collection[_cIndex]._hKey = _sIndex;
    }
    GetNameByKey(_key) {
        let index = this._collection.findIndex((element) => element._hKey == _key);
        return this._collection[index]._sourceName;
    }
}

class Service {
    constructor(name, importance) {
        this._name = name;
        this._importance = importance;
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
    Init(_data) {
        let arr = this.GetServices();
        let numServices = arr.length;
        
        for (let i = 0; i < numServices; i++) {
            this._collection[i] = new Service(arr[i].name, arr[i].importance);
        }
    }
    GetServices() {
        let arr = [
            {name: "Process", importance: "Critical"},
            {name: "WSClient", importance: "Critical"},
            {name: "Logger", importance: "Critical"},
            {name: "SystemBus", importance: "Critical"},
            {name: "LoggerBus", importance: "Critical"},
            {name: "DeviceManager", importance: "Critical"},
            {name: "ProxyWSClient", importance: "Critical"},
        ];
        return arr;
    }
    SetServiceObject(_name, _obj) {
        let index = this._collection.findIndex((element) => element._name == _name);

        if (index != -1) {
            this._collection[index].object = _obj;
        }
    }
    GetServiceObject(_name) {
        let index = this._collection.findIndex((element) => element._name == _name);

        if (index != -1) {
            return this._collection[index].object;
        }
        else {
            return undefined;
        }
    }
}

class ProcessSrv {
    #_SourcesState;
    #_ServicesState;

    constructor() {
        //реализация паттерна синглтон
        if (this.Instance) {
            return this.Instance;
        } else {
            ProcessSrv.prototype.Instance = this;
        }
        this._sysBus;
        this._logBus;
    }
    /**
     * @method
     * @description
     * Инициализирует работу Process. Создаёт объект, описывающий подключения
     * и генерирует событие для клиентов на подключение к источникам
     * @param {Object} _data    - данные из БД, переданные DBProvider
     */
    Init(_data) {
        // Нет объекта - создать
        if (typeof this.#_SourcesState === 'undefined') {
            this.#_SourcesState = new Sources();
            this.#_SourcesState.Init(_data);

            this.#_ServicesState = new Services();
            this.#_ServicesState.Init(_data);
            this.#_ServicesState.SetServiceObject("Process", this);

            this._sysBus = new ClassBus();
            this._logBus = new ClassBus();
            this._sysBus.on('ws-addr-fail', () => {
                this._LoggerBus.emit('logError', "Failed to connect to anyone via WebSocket!");
            });
            this._sysBus.on('ws-addr-done', () => {
                let arr = [];
                this.#_SourcesState._collection.forEach((connection) => {
                    if (connection._isConnected == 1) {
                        arr.push(connection._sourceName)
                    }
                });
                this._logBus.emit('logInfo', "Connected to: " + arr);
                // Генерация события для прокси на отправку запроса на имена и МАC-адреса
                /*let packet = {com: 'proc-get-systemdata', args: []};
                arr.forEach((connect) => {
                    this._SystemBus.emit('pwsc-send', packet, connect);
                });*/
            });
            this._sysBus.on('proc-return-systemdata', (ph) => {
                this._logBus.emit('logInfo', "Meta data updated!");
                this._sysBus.emit('proc-connections-done', this._SourcesState);
            });
        }
        return { SourcesState: this._SourcesState, ServicesState: this._ServicesState, sysBus: this._sysBus, logBus: this._logBus };
    }
    Run() {
        // Генерация события для каждого клиента - сигнал, что объект с подключениями готов
        this.GetSourceClients().forEach(source => {
            this._SystemBus.emit(source.genEvent, this._SourcesState);
        });
    }
    /**
     * @method
     * Возвращает из базы данных список доступных клиентов и имена событий для генерации
     * @returns Array[Object]   sources - массив объектов с описанием клиентов
     */
    GetSourceClients() {// Заглушка
        let sources = [{id: 0, name: "WebSocket", genEvent: "ws-addr-cast"}];
        return sources;
    }
    get _SourcesState() {
        return this.#_SourcesState;
    }
    get _ServicesState() {
        return this.#_ServicesState;
    }
}

module.exports = ProcessSrv;