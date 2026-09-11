const ClassBaseService_S = require('../../srvService/js/srvService.js');
const COM_ALL_DATA_RAW_GET = 'all-data-raw-get';
const COM_ALL_DATA_FINE_GET = 'all-data-fine-get';
const COM_ALL_DATA_FINE_SET = 'all-data-fine-set';
const COM_ALL_ACTUATOR_SET = 'all-actuator-set';

const EVENT_SYSBUS_LIST = ['all-init-stage1-set', 'test-connect'];

/**
 * @class ClassProxyActuatorDriver_S
 * @extends ClassBaseService_S
 * @description Базовый класс прокси-службы для управления драйверами актуаторов (моторов, мостовых схем, матричных схем).
 * Предоставляет общие методы для работы с шинами, рассылки команд и обработки входящих событий актуаторов.
 */
class ClassProxyActuatorDriver_S extends ClassBaseService_S {
    /**
     * @constructor
     * @param {object} params
     * @param {string} params._name - Имя службы.
     * @param {Array} params._busList - Список шин, созданных в проекте.
     * @param {string} params._primaryBus - Первичная шина для связи с управляющей службой.
     * @param {object} params._node - Объект узла.
     * @param {string} params._clientName - Имя клиентской службы (например, 'mhbridge' или 'mmtrxmotor').
     * @param {string} params._protocol - Имя протокола (например, 'mhbridge' или 'mmtrxmotor').
     * @param {string[]} params._busNamesList - Список дополнительных имен шин.
     */
    constructor({ _name, _busList, _primaryBus, _node, _clientName, _protocol, _busNamesList }) {
        const busNamesList = ['sysBus', 'logBus', ...(_busNamesList ?? [])];
        super({ _name, _busNameList: [_primaryBus, ...busNamesList], _busList, _node });
        this.PrimaryBus = _primaryBus;
        this.ClientName = _clientName;
        this.Protocol = _protocol;
    }
    
    /**
     * @member {string|undefined} HostSrvName
     * @getter
     * @description Имя хост-прокси службы, если настроено в AdvancedOptions клиентской службы.
     */
    get HostSrvName() { 
        const hostSrvName = this.ServicesState[this.ClientName]?.AdvancedOptions?.host;
        return hostSrvName ? `proxy${hostSrvName}` : undefined;
    }

    /**
     * @method Channels
     * @generator
     * @description Возвращает итератор по каналам (службам), привязанным к указанному источнику и первичной шине.
     * @param {string} sourceName - Имя источника данных.
     * @yields {object} Объект службы канала.
     */
    *Channels(sourceName) {
        for (const service of Object.values(this.ServicesState)) {
            if (service.AdvancedOptions?.SourceName == sourceName && service.BusList?.includes?.(this.PrimaryBus))
                yield service;
        }
    }

    /**
     * @method Sources
     * @generator
     * @description Возвращает итератор по активным источникам, поддерживающим протокол данной службы.
     * @yields {object} Объект состояния источника.
     */
    *Sources() {
        for (let source of Object.values(this.SourcesState)) {
            if (source.Protocol === this.Protocol && !source.IsConnected && source.CheckProcess && source.Status === 'active')
                yield source;
        };
    }

    /**
     * @method HandlerEvents_send
     * @description Базовый обработчик события отправки команды. Маршрутизирует команду от канала к клиентской службе.
     * @param {object} _msg - Содержимое сообщения от шины.
     */
    HandlerEvents_send(_msg) {
        let { arg, value } = _msg;
        let [cmd] = value[0].value;
        const chName = _msg.metadata.source;
        const sourceName = chName ? this.ServicesState[chName]?.Service?.SourceName : undefined;

        if (sourceName != undefined) {
            this.EmitEvents_client_cmd(sourceName, cmd);
        }
    }

    /**
     * @method HandlerEvents_res
     * @description Базовый обработчик события ответа от клиентской службы. Маршрутизирует ответ к каналу.
     * @param {object} _msg - Содержимое сообщения от клиентской службы.
     */
    HandlerEvents_res(_msg) {
        const source_name = _msg.arg[0];
        const ch_name = Object.values(this.ServicesState).find(obj => obj.Service?.SourceName == source_name)?.Name;
        if (!ch_name) {
            this.EmitEvents_logger_log({ level: 'E', msg: `Received msg from ${this.ClientName} but no channel found for source ${source_name}.` });
            return
        }
        const value = _msg.value[0];

        this.EmitEvents_all_data_raw_get(source_name, ch_name, value);
    }

    /**
     * @method EmitEvents_client_cmd
     * @description Отправляет команду клиентской службе актуатора.
     * @param {string} sourceName - Имя источника.
     * @param {object} cmd - Объект команды.
     */
    EmitEvents_client_cmd(sourceName, cmd) {
        const msg = {
            dest: this.ClientName,
            com: `${this.ClientName}-cmd`,
            arg: [sourceName],
            value: [cmd]
        }
        this.EmitMsg(this.PrimaryBus, msg.com, msg);
    }

    /**
     * @method EmitEvents_all_data_raw_get
     * @description Обновляет "сырые" (raw) данные управляющего канала.
     * @param {string} source_name - Имя источника.
     * @param {string} ch_name - Имя канала.
     * @param {any} value - Значение для записи.
     */
    EmitEvents_all_data_raw_get(source_name, ch_name, value) {
        if (!(source_name && ch_name)) return;
        const msg = {
            dest: ch_name,
            com: COM_ALL_DATA_RAW_GET,
            arg: [source_name],
            value: [{
                com: COM_ALL_DATA_RAW_GET,
                arg: [ch_name],
                value: [value]
            }]
        }
        this.EmitMsg(this.PrimaryBus, msg.com, msg);
    }

    /**
     * @method EmitEvents_all_data_fine_get
     * @description Запрашивает точное (fine) значение у канала актуатора.
     * @param {string} ch_name - Имя канала актуатора.
     */
    EmitEvents_all_data_fine_get(ch_name) {
        if (!ch_name) return;
        const msg = {
            dest: ch_name,
            com: COM_ALL_DATA_FINE_GET,
            arg: [ch_name],
            value: []
        }
        this.EmitMsg('dataBus', msg.com, msg);
    }

    /**
     * @method EmitEvents_all_actuator_set
     * @description Отправляет команду управления непосредственно физическому ключу (актуатору).
     * @param {string} chName - Имя канала актуатора.
     * @param {any} value - Значение переключения (например, MOTOR_ON / MOTOR_OFF).
     */
    EmitEvents_all_actuator_set(chName, value) {
        const msg = {
            dest: chName,
            com: COM_ALL_ACTUATOR_SET,
            arg: [chName],
            value: [value]
        }
        this.EmitMsg('dataBus', msg.com, msg);
    }
}

module.exports = ClassProxyActuatorDriver_S;
