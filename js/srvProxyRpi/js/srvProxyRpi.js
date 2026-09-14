const ClassProxyActuatorDriver_S = require('../../srvProxyActuatorDriver/js/srvProxyActuatorDriver.js');

const THIS_NAME = 'proxyrpiclient';
const PROTOCOL = 'rpi';
const CLIENT_NAME = 'rpiclient';
const PRIMARY_BUS = 'rpiBus';

const COM_ALL_DATA_FINE_SET = 'all-data-fine-set';

const EVENT_SYSBUS_LIST = ['all-init-stage1-set', 'test-connect'];
const EVENT_PRIMBUS_LIST = [
    'proxyrpiclient-send', 'proxyrpiclient-res', 'proxyrpiclient-cmd',
    'proxyrpi-send', 'proxyrpi-res', 'proxyrpi-cmd', 'proxyrpi-ch-get'
];
const BUS_NAMES_LIST = ['rpiBus', 'dataBus'];

/**
 * Normalizes channel mapping configuration into a Map<port, channelName> and Map<channelName, port>.
 * Supports:
 * - Array format (e.g. ['ch-0', 'ch-1'] where index is port number)
 * - Object format (e.g. { 4: 'ch-relay-1', 17: 'ch-relay-2' } where key is port number)
 * @param {Array<string>|Object<string|number, string>} channelsConfig
 * @returns {{ portToCh: Map<string|number, string>, chToPort: Map<string, string|number> }}
 */
function normalizeChannelConfig(channelsConfig) {
    const portToCh = new Map();
    const chToPort = new Map();
    if (!channelsConfig) return { portToCh, chToPort };

    if (Array.isArray(channelsConfig)) {
        channelsConfig.forEach((chName, index) => {
            if (chName) {
                const portKey = index;
                portToCh.set(portKey, chName);
                portToCh.set(String(portKey), chName);
                chToPort.set(chName, portKey);
            }
        });
    } else if (typeof channelsConfig === 'object') {
        for (const [port, chName] of Object.entries(channelsConfig)) {
            if (chName) {
                const numPort = Number(port);
                const portKey = !isNaN(numPort) ? numPort : port;
                portToCh.set(portKey, chName);
                portToCh.set(String(port), chName);
                chToPort.set(chName, portKey);
            }
        }
    }
    return { portToCh, chToPort };
}

class ClassProxyRpiClient_S extends ClassProxyActuatorDriver_S {
    /**
     * @constructor
     * @description Конструктор класса прокси Raspberry Pi GPIO
     * @param {object} params
     * @param {Array} params._busList - список шин
     * @param {string} [params._primaryBus] - первичная шина
     * @param {object} [params._node] - узел
     */
    constructor({ _busList, _primaryBus, _node }) {
        const primBus = _primaryBus ?? PRIMARY_BUS;
        super({
            _name: THIS_NAME,
            _busList,
            _primaryBus: primBus,
            _node,
            _clientName: CLIENT_NAME,
            _protocol: PROTOCOL,
            _busNamesList: [primBus, ...BUS_NAMES_LIST],
        });
        
        /** @type {Map<string, { original: object, portToCh: Map<string|number, string>, chToPort: Map<string, string|number> }>} */
        this._SourcesOpts = new Map();

        this.FillEventOnList('sysBus', EVENT_SYSBUS_LIST);
        this.FillEventOnList(this.PrimaryBus, EVENT_PRIMBUS_LIST);
        this.FillEventOnList('dataBus', [COM_ALL_DATA_FINE_SET]);
    }

    /**
     * @method GetSourceByChName
     * @description Поиск имени источника по имени канала
     * @param {string} chName 
     * @returns {string|undefined}
     */
    GetSourceByChName(chName) {
        for (const [sourceName, opts] of this._SourcesOpts.entries()) {
            if (opts.chToPort.has(chName)) {
                return sourceName;
            }
        }
        return undefined;
    }

    /**
     * @method GetPortByChName
     * @description Получение порта по имени источника и канала
     * @param {string} sourceName 
     * @param {string} chName 
     * @returns {string|number|undefined}
     */
    GetPortByChName(sourceName, chName) {
        const opts = this._SourcesOpts.get(sourceName);
        return opts?.chToPort.get(chName);
    }

    /**
     * @method GetChNameByPort
     * @description Получение имени канала по имени источника и порту
     * @param {string} sourceName 
     * @param {string|number} port 
     * @returns {string|undefined}
     */
    GetChNameByPort(sourceName, port) {
        const opts = this._SourcesOpts.get(sourceName);
        return opts?.portToCh.get(port) ?? opts?.portToCh.get(String(port));
    }

    /**
     * @method HandlerEvents_all_init_stage1_set
     * @async
     * @description Инициализация stage 1: нормализация каналов и передача списка портов rpiclient
     * @param {string} _topic 
     * @param {object} _msg 
     */
    async HandlerEvents_all_init_stage1_set(_topic, _msg) {
        super.HandlerEvents_all_init_stage1_set(_topic, _msg);

        for (let source of this.Sources()) {
            const { portToCh, chToPort } = normalizeChannelConfig(source.AdvOpts?.channels);
            this._SourcesOpts.set(source.Name, {
                original: source.AdvOpts,
                portToCh,
                chToPort
            });

            // Отбираем порты для передачи клиенту rpiclient для назначения watch
            const inputPorts = this._FilterInputPorts(source, portToCh);
            this.EmitEvents_rpiclient_init_ports(source.Name, inputPorts);
        }
    }

    /**
     * Фильтрует порты источника для отправки на клиент (rpiclient) для установки watch.
     * @param {object} source - объект источника
     * @param {Map<string|number, string>} portToCh - нормализованная карта портов и каналов
     * @returns {Array<string|number>} массив портов для отслеживания
     */
    _FilterInputPorts(source, portToCh) {
        // 1. Если в AdvOpts явно задан список inputs, используем его
        if (Array.isArray(source.AdvOpts?.inputs)) {
            return source.AdvOpts.inputs;
        }

        // 2. Формируем список портов с проверкой имени канала
        const inputPorts = [];

        for (const [port, chName] of portToCh.entries()) {
            // Игнорируем строковые дубликаты ("4" при наличии числового 4)
            if (typeof port === 'number' || !portToCh.has(Number(port))) {
                if (this.IsInputChannel(chName)) {
                    inputPorts.push(port);
                }
            }
        }

        return inputPorts;
    }

    /**
     * Шаблон функции-фильтра для проверки, является ли канал входным.
     * Вы можете переопределить эту логику (например, проверкой вхождения слов или свойств).
     * @param {string} chName - имя канала (например "ch-button-1")
     * @returns {boolean} true, если канал является входным
     */
    IsInputChannel(chName) {
        this.ServicesState[chName]?.Service?.ChType == 'sensor';
    }

    /**
     * Передает список портов клиенту rpiclient для назначения watch
     */
    EmitEvents_rpiclient_init_ports(sourceName, ports) {
        const msg = {
            dest: this.ClientName,
            com: `${this.ClientName}-init-ports`,
            arg: [sourceName],
            value: [{ ports }]
        };
        this.EmitMsg(this.PrimaryBus, msg.com, msg);
    }

    HandlerEvents_proxyrpiclient_send(_topic, _msg) {
        this.HandlerEvents_send(_msg);
    }

    HandlerEvents_proxyrpi_send(_topic, _msg) {
        this.HandlerEvents_send(_msg);
    }

    HandlerEvents_proxyrpiclient_res(_topic, _msg) {
        this.HandlerEvents_res(_msg);
    }

    HandlerEvents_proxyrpi_res(_topic, _msg) {
        this.HandlerEvents_res(_msg);
    }

    /**
     * Обработка обновлений состояния портов от клиента rpiclient (от watch или при инициализации)
     */
    HandlerEvents_proxyrpi_ch_get(_topic, _msg) {
        this._ProcessClientChGet(_msg);
    }

    HandlerEvents_proxyrpi_cmd(_topic, _msg) {
        this._ProcessClientChGet(_msg);
    }

    HandlerEvents_proxyrpiclient_cmd(_topic, _msg) {
        this._ProcessClientChGet(_msg);
    }

    _ProcessClientChGet(_msg) {
        const sourceName = _msg.arg[0];
        const port = _msg.value[0].arg[0];
        const value = _msg.value[0].value[0];

        const chName = this.GetChNameByPort(sourceName, port);
        if (!chName) return;

        this.EmitEvents_all_actuator_set(chName, value);
        this.EmitEvents_all_data_fine_get(chName);
    }

    /**
     * Обработка точных данных с dataBus для конкретного канала
     */
    HandlerEvents_all_data_fine_set(_topic, _msg) {
        try {
            const chName = _msg.arg[0];
            const sourceName = this.GetSourceByChName(chName);
            if (!sourceName) return;

            const { Value } = _msg.value[0];
            const port = this.GetPortByChName(sourceName, chName);

            if (port !== undefined) {
                this.EmitEvents_rpiclient_ch_set(sourceName, port, Value);
            }
        } catch (e) {
            this.EmitEvents_logger_log({ msg: `Error while processing data-fine msg in proxyrpi`, level: 'E', obj: _msg });
        }
    }

    /**
     * Отправка команды установки значения порта в rpiclient
     */
    EmitEvents_rpiclient_ch_set(sourceName, port, value) {
        const msg = {
            dest: this.ClientName,
            com: `${this.ClientName}-ch-set`,
            arg: [sourceName],
            value: [{
                arg: [port],
                value: [value]
            }]
        };
        this.EmitMsg(this.PrimaryBus, msg.com, msg);
    }
}

module.exports = ClassProxyRpiClient_S;