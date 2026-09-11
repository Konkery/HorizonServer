const ClassProxyActuatorDriver_S = require('../../srvProxyActuatorDriver/js/srvProxyActuatorDriver.js');
const THIS_NAME = 'proxymmtrxmotor';
const PROTOCOL = 'mmtrxmotor';
const CLIENT_NAME = 'mmtrxmotor';

const COM_ALL_DATA_FINE_SET = 'all-data-fine-set';

const EVENT_SYSBUS_LIST = ['all-init-stage1-set', 'test-connect'];
const EVENT_PRIMBUS_LIST = ['proxymmtrxmotor-send', 'proxymmtrxmotor-res', 'proxymmtrxmotor-cmd'];
const BUS_NAMES_LIST = ['mmtrxmotorBus', 'dataBus'];

class ClassProxyModBusMatrixMotor_S extends ClassProxyActuatorDriver_S {
    /**
     * @constructor
     * @description
     * Конструктор класса прокси матрицы моторов
     * @param {[ClassBus_S]} _busList - список шин, созданных в проекте
     */
    constructor({ _busList, _primaryBus, _node }) {
        super({
            _name: THIS_NAME,
            _busList,
            _primaryBus,
            _node,
            _clientName: CLIENT_NAME,
            _protocol: PROTOCOL,
            _busNamesList: BUS_NAMES_LIST,
        });
        /** @type {Map<string, import('../../srvMatrixMotorCtrl/js/srvMatrixCtrl').TypeMatrixCtrlAdvOpts>} */
        this._SourcesOpts = new Map();
        this.FillEventOnList('sysBus', EVENT_SYSBUS_LIST);
        this.FillEventOnList(this.PrimaryBus, EVENT_PRIMBUS_LIST);
        this.FillEventOnList('dataBus', [COM_ALL_DATA_FINE_SET]);
        // this.EmitEvents_logger_log({ level: 'I', msg: 'ProxyModbusMatrixMotor initialized.' });
    }

    GetSourceByChName(chName) {
        for (const [sourceName, opts] of this._SourcesOpts.entries()) {
            if (opts.channels?.rows?.includes?.(chName) || opts.channels?.cols?.includes?.(chName))
                return sourceName;
        }
    }

    
    /**
     * @method HandlerEvents_all_init_stage1_set
     * @async
     * @description Обработчик события инициализации stage 1. Извлекает и сохраняет настройки источников.
     * @param {string} _topic - Тема события.
     * @param {object} _msg - Содержимое сообщения.
     */
    async HandlerEvents_all_init_stage1_set(_topic, _msg) {
        super.HandlerEvents_all_init_stage1_set(_topic, _msg);

        for (let source of this.Sources()) {
            this._SourcesOpts.set(source.Name, source.AdvOpts);
        }
    }

    HandlerEvents_proxymmtrxmotor_send(_topic, _msg) {
        this.HandlerEvents_send(_msg);
    }

    HandlerEvents_proxymmtrxmotor_res(_topic, _msg) {
        this.HandlerEvents_res(_msg);
    }

    HandlerEvents_proxymmtrxmotor_cmd(_topic, _msg) {
        const src = _msg.metadata.source;
        if (src != this.ClientName) return;

        const sourceName = _msg.arg[0];
        const [axis, chNum] = _msg.value[0].arg; // axis is 'cols' | 'rows'
        const value = _msg.value[0].value[0];

        const mtrxOpts = this._SourcesOpts.get(sourceName);
        if (!mtrxOpts) return;

        const chName = mtrxOpts.channels?.[axis]?.[chNum];
        if (!chName) return;

        this.EmitEvents_all_actuator_set(chName, value);
        this.EmitEvents_all_data_fine_get(chName);
    }

    HandlerEvents_all_data_fine_set(_topic, _msg) {
        try {
            const chName = _msg.arg[0];
            const sourceName = this.GetSourceByChName(chName);
            if (!sourceName) return;
            const { Value } = _msg.value[0]; 

            const mtrxOpts = this._SourcesOpts.get(sourceName);
            if (!mtrxOpts) return;

            let axis, chNum;
            if (mtrxOpts.channels?.rows?.includes(chName)) {
                axis = 'rows';
                chNum = mtrxOpts.channels.rows.indexOf(chName);
            } else if (mtrxOpts.channels?.cols?.includes(chName)) {
                axis = 'cols';
                chNum = mtrxOpts.channels.cols.indexOf(chName);
            }

            if (axis && chNum > -1) {
                this.EmitEvents_mmtrxmotor_ch_set(sourceName, axis, chNum, Value);
            }
        } catch (e) {
            this.EmitEvents_logger_log({ msg: `Error while processing data-fine msg`, level: 'E', obj: _msg });
        }
    }

    EmitEvents_mmtrxmotor_ch_set(sourceName, axis, chNum, value) {
        const msg = {
            dest: this.ClientName,
            com: `${this.ClientName}-ch-set`,
            arg: [sourceName],
            value: [{
                arg: [axis, chNum],
                value: [value]
            }]
        }
        this.EmitMsg(this.PrimaryBus, msg.com, msg);
    }
}

module.exports = ClassProxyModBusMatrixMotor_S;