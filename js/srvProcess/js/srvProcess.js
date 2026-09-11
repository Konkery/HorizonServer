const ClassBaseService_S = require('./../../srvService/js/srvService');


/**
 * @constant
 * Таймаут проверки Process запущенных служб
 */
const PROCESS_CHECK_TIMEOUT = 500;
/**
 * @constant
 * Таймаут перед тем, как Process возбудит событие register
 */
const PROCESS_BUS_TIMEOUT = 500;
const PROCESS_DB_TIMEOUT = 500;

const EVENT_SYSBUS_LIST = ['all-init-stage1-set','process-ws-connect-done', 'process-mb-connect-done'];
const EVENT_MDBBUS_LIST = ['providermdb-init-stage0-get'];

const BUS_NAMES_LIST = ['sysBus', 'logBus', 'mdbBus', 'dataBus'];
const LHPSERVICES_LIST = ['proxywsclient', 'wsclient'];
const MQTTSERVICES_LIST = ['proxymqttclient', 'mqttclient'];
const RPISERVICES_LIST = ['proxyrpiclient', 'rpiclient'];

const PROCESS_NAME = 'process';

/**
 * @class
 * @description
 * Класс реализует функционал Process - службы, отвечающий за мониторинг запуска фреймворка,
 * создания шин и служебных контейнеров
 */
class ClassProcessSrv extends ClassBaseService_S {
    #_SourcesState;
    #_ServicesState;
    #_GBusList;
    #_Node;
    #_TimeOut;
    #_TestInterval;

    /**
     * @constructor
     * Конструктор класса
     * @param {[ClassBus_S]} _busList - список шин, созданных в проекте
     */
    constructor({ _busList, _node }) {
        super({ _name: PROCESS_NAME, _busNameList: BUS_NAMES_LIST, _busList, _node });
        this.#_GBusList = _busList;
        this.#_Node = _node;
        this.#_SourcesState = {};
        this.#_ServicesState = {};
        this.Init();
    }
    /**
     * @method
     * @description
     * Инициализирует работу Process. Создаёт объект, создаёт критически
     * необходимые шины и подписывает на необходимые события
     */
    Init() {
        BUS_NAMES_LIST.forEach((element) => {
            try {
                this.CreateBus(element);
            }
            catch (e) {
                console.log(`Failed to create bus: ${element}\n${e}`);
            }
        });
        this.UpdateBusList();
        this.FillEventOnList('sysBus', EVENT_SYSBUS_LIST);
        this.FillEventOnList('mdbBus', EVENT_MDBBUS_LIST);
        const config = require('./app/config.json');
        config.Primary.forEach((sysservice) => {
            try {
                const servName = sysservice.Name;
                this.#_ServicesState[servName] = sysservice;
                if (servName === 'process') {
                    this.#_ServicesState[servName].Service = this;
                }
                else
                    this.#_ServicesState[servName].Service = new (require(sysservice.Module))({_busList: this.#_GBusList, _node: this.#_Node}, sysservice.Options);
            }
            catch (e) {
                sysservice.ErrorMsg = e.toString();
                this.EmitEvents_logger_log({level: 'E', msg: `Failed to initialize primary service ${sysservice.Name}.`, obj: sysservice});
            }
        })

        this.EmitEvents_process_init0();
        this.#_TimeOut = setTimeout(() => {
            /* debughome */
            this.EmitEvents_logger_log({level: 'E', msg: `No response from DataBase. Using default template for debug`});

            let arr1 = require('./app/Sources');
            let arr2 = require('./app/Services');
            let arr3 = require('./app/Templates');
            let arr4 = require('./app/Channels');
            
            this.Fill(arr2, arr1, arr3, arr4);
            /* debugend */
        }, PROCESS_DB_TIMEOUT);
    }
    /**
     * @method
     * @description Сохраняет ссылки на используемые шины, информацию об источниках и инициализирует базовые обработчики
     * @param {InitOpts} arg - объект со ссылками на внешние зависимости 
     */
    async HandlerEvents_process_ws_connect_done(_topic, _msg) {       
        //this.EmitEvents_proxy_send({ value: msg_to_PLC, arg: [source_name] })
        this.EmitEvents_logger_log({level: 'I', msg: 'Ready to send info to dm!'});
        this.EmitEvents_all_connections_done();
    }
    EmitEvents_all_connections_done() {
        const msg = {
            com: 'all-connections-done',
        }
        this.EmitMsg('sysBus', msg.com, msg);
    }
    /**
     * @method
     * @description Вызывает заполнение стейтов из полученных массивов
     * @param {InitOpts} arg - объект со ссылками на внешние зависимости
     */
    HandlerEvents_providermdb_init_stage0_get(_topic, _msg) {
        clearTimeout(this.#_TimeOut);
        this.Fill(_msg.arg[0], _msg.arg[2], _msg.arg[4], _msg.arg[5]);
    }
    /**
     * @method
     * @description Запускает событие init-stage0
     * @returns msg
     */
    EmitEvents_process_init0() {
        const msg = {
            com: 'providermdb-init-stage0-set',
            dest: 'providermdb',
            demandRes: true,
            resCom: 'providermdb-init-stage0-get',
            arg: [],
            value: []
        }
        return this.EmitMsg('mdbBus', msg.com, msg);
    }
    /**
     * @method
     * @description Запускает событие init-stage1
     * @returns msg
     */
    EmitEvents_all_init_stage1() {
        const msg = {
            dest: 'all',
            com: 'all-init-stage1-set',
            arg: [ { SourcesState: this._SourcesState, ServicesState: this._ServicesState }]
        }
        this.EmitMsg('sysBus', msg.com, msg);
    }
    /**
     * @method
     * @description Запускает событие all_connect
     * @returns msg
     */
    EmitEvents_all_connect() {
        const msg = {
            dest: 'all',
            com: 'all-connect',
            arg: [],
            value: []
        }
        this.EmitMsg('sysBus', msg.com, msg);
    }
    /**
     * @method
     * @description Запускает событие all_disconnect
     * @returns msg
     */
    EmitEvents_all_disconnect() {
        const msg = {
            dest: 'all',
            com: 'all-disconnect',
            arg: [],
            value: []
        }
        this.EmitMsg('sysBus', msg.com, msg);
    }
    /**
     * @method
     * @description Запускает событие all_connect
     * @returns msg
     */
    EmitEvents_source_connect() {
        const msg = {
            dest: 'all',
            com: 'source-connect',
            arg: [],
            value: []
        }
        this.EmitMsg('sysBus', msg.com, msg);
    }
    /**
     * @method
     * @description
     * Заполняет служебные контейнеры по полученным из БД массивам источников и служб
     * @param {Array} _dbServices    - массив служб
     * @param {Array} _dbSources    - массив источников 
     */
    Fill(_dbServices, _dbSources, _dbTemplates, _dbChannels) {
        if (!(_dbServices instanceof Array)) {
            this.EmitEvents_logger_log({level: 'C', msg: 'Missing service array!', obj: _dbServices});
            return;
        }
        if (!(_dbSources instanceof Array)) {
            this.EmitEvents_logger_log({level: 'C', msg: 'Missing sources array!', obj: _dbSources});
            return;
        }

        if (!(_dbChannels instanceof Array)) {
            this.EmitEvents_logger_log({level: 'C', msg: 'Missing channels array!', obj: _dbChannels});
            return;
        }

        if (!(_dbTemplates instanceof Array)) {
            this.EmitEvents_logger_log({level: 'C', msg: 'Missing templates array!', obj: _dbChannels});
            return;
        }

        try {
            const config = require('./app/config.json').Auxilary;
            // Обновляем основные службы
            _dbServices.forEach(service => {
                try {
                    if (service.Importance === 'primary') {
                        if (this.#_ServicesState[service.Name] && this.#_ServicesState[service.Name].Service) {
                            service.Service = this.#_ServicesState[service.Name].Service;
                            this.#_ServicesState[service.Name] = service;
                        }
                        else {
                            this.EmitEvents_logger_log({level: 'E', msg: `Primary service ${service.Name} is not initialized.`, obj:  this.#_ServicesState[service.Name]});
                        }
                    }
                    if (service.Importance === 'auxilary' && service.Protocol === 'sys') {
                        try {
                            service.Service = new (require(config[service.Name]))({_busList: this.#_GBusList, _primaryBus: service.PrimaryBus, _node: this.#_Node}, service.AdvancedOptions);
                            this.#_ServicesState[service.Name] = service;
                        }
                        catch (e) {
                            this.EmitEvents_logger_log({level: 'E', msg: `Failed to start auxilary service ${service.Name}. ${e.message}`, obj:  this.#_ServicesState[service.Name]});
                        }                    
                    }
                }
                catch (e) {
                    console.log(`_dbServices: ${e}`);
                }
            })

            // Заполняем источники
            _dbSources.forEach(source => {
                try {
                    const protocol = source.Protocol.toLowerCase();
                    _dbServices
                        .filter(service => service.Protocol === protocol && !this.#_ServicesState[service.Name])
                        .forEach(service => {
                            try {
                                if (!this.#_GBusList[service.PrimaryBus]) {
                                    this.CreateBus(service.PrimaryBus);
                                }
                                if (service.Importance === 'exploitary') {
                                    let hostService = _dbServices.filter(host => host.Name === service.AdvancedOptions.host)[0];
                                    if (this.#_GBusList[hostService.PrimaryBus] == undefined) {
                                        this.CreateBus(hostService.PrimaryBus);
                                    }
                                    if (this.#_ServicesState[hostService.Name] == undefined) {
                                        hostService.Service = new (require(config[hostService.Name]))({_busList: this.#_GBusList, _primaryBus: hostService.PrimaryBus, _node: this.#_Node, _protocol: hostService.Protocol.toLowerCase(), _Name: hostService.Name});
                                        this.#_ServicesState[hostService.Name] = hostService;
                                    }

                                    service.Service = new (require(config[service.Name]))({_busList: this.#_GBusList, _primaryBus: service.PrimaryBus, _node: this.#_Node, _protocol: protocol, _host: service.AdvancedOptions.host, _expBus: hostService.PrimaryBus, _Name: service.Name});
                                    this.#_ServicesState[service.Name] = service;
                                }
                                else {
                                    service.Service = new (require(config[service.Name]))({_busList: this.#_GBusList, _primaryBus: service.PrimaryBus, _node: this.#_Node, _protocol: protocol, _Name: service.Name});
                                    this.#_ServicesState[service.Name] = service;
                                }                                
                            }
                            catch (e) {
                                console.log(`Failed to create service: ${service.Name}\n${e}`);
                            }
                    })
                    source.CheckProcess = true;
                    source.IsConnected = false;
                    this.#_SourcesState[source.Name] = source;
                }
                catch (e) {
                    console.log(`_dbSources: ${e}`);
                }
            });
        
            // Создаём каналы
            _dbChannels.forEach(channel => {
                try {
                    const source = this.#_SourcesState[channel.SourceName];
                    if (typeof source === 'undefined') {
                        this.EmitEvents_logger_log({level: 'W', msg: `Cannot find source '${channel.SourceName}' for channel '${channel.Name}'.`});
                    }
                    else if (typeof source === 'virtual') {
                        let chService = Object.assign({}, _dbTemplates.find(template => template.Protocol == 'virtual'));
                        chService.AdvancedOptions = channel;
                        chService.Service = new (require(config[channel.ChType]))({_busList: this.#_GBusList, _busNameList: chService.BusList.concat([chService.PrimaryBus]), _advOpts: channel});
                        chService.Name = chService.Service.Name;
                        this.#_ServicesState[chService.Name] = chService;
                    }
                    else if (source.Property.includes('r')) {
                        let chService = Object.assign({}, _dbTemplates.find(template => template.Protocol == source.Protocol));
                        chService.AdvancedOptions = channel;
                        chService.Service = new (require(config[channel.ChType]))({_busList: this.#_GBusList, _busNameList: chService.BusList.concat([chService.PrimaryBus]), _advOpts: channel});
                        chService.Name = chService.Service.Name;
                        this.#_ServicesState[chService.Name] = chService;
                    }
                }
                catch(e) {
                    console.log(`_dbChannels: ${e}`);
                }
            })

            // Ждём, тогда создадутся службы
            setTimeout(() => {
                this.EmitEvents_logger_log({level: 'I', msg: 'State lists are formed!'});
                this.EmitEvents_all_init_stage1();
                setTimeout(() => {// ждём 3 секунды на проверку служб
                    const errList = Object.keys(this.#_ServicesState).filter(key => this.#_ServicesState[key].Status === 'stopped' && this.#_ServicesState[key].Importance === 'primary');
                    const srvList = Object.keys(this.#_ServicesState).filter(key => this.#_ServicesState[key].Status === 'running');
                    
                    if (errList.length > 0) {
                        this.#_ServicesState[this.Name].ErrorMsg = 'Failed initialization';
                        this.EmitEvents_logger_log({level: 'E', msg: 'Uninitialized primary services!', obj: {names: errList}});
                    }
                    this.EmitEvents_logger_log({level: 'I', msg: 'System startup finished!', obj: {services: srvList}});
                    /* debugstart */
                    console.log("System startup finished!");
                    this.EmitEvents_source_connect();
                    /* debugend */
                }, PROCESS_CHECK_TIMEOUT);
            }, PROCESS_BUS_TIMEOUT);
        }
        catch (e) {
            this.EmitEvents_logger_log({level: 'E', msg: 'Unexpected error during services start-up!', obj: {meggase: e.message}});
        }        
    }
    /**
     * @method
     * @description Запуск подключений к источникам
     */
    Connect() {
        this.EmitEvents_all_connect();
    }
    /**
     * @method
     * @description Отключение от источников
     */
    Disconnect() {
        this.EmitEvents_all_disconnect();
    }
    /* debughome */
    /**
     * @method
     * Возвращает из базы данных список доступных клиентов и имена событий для генерации
     * @returns Array[Object]   sources - массив объектов с описанием клиентов
     */
    GetSourceClients() {// Заглушка
        let sources = [{id: 0, name: "WebSocket", genEvent: "connect"}];
        return sources;
    }
    GatewayTest() {
        const chList = Object.keys(this.#_ServicesState).filter(key => this.#_ServicesState[key].PrimaryBus === 'dataBus');
        this.#_TestInterval = setInterval(() => {
            chList.forEach(channel => {
                console.log(this.#_ServicesState);
                this.#_ServicesState[channel].Service.Value = (Math.random() * 100).toFixed(3);
            })
        }, 5000);
    }
    GatewayTestStop() {
        clearTimeout(this.#_TestInterval);
    }
    /* debugend */
    get _SourcesState() {
        return this.#_SourcesState;
    }
    get _ServicesState() {
        return this.#_ServicesState;
    }
}

module.exports = ClassProcessSrv;