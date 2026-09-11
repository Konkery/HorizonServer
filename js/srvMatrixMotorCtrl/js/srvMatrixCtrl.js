const ClassBaseService_S = require('./../../srvService/js/srvService');
const { EventEmitter2 } = require("eventemitter2");
/**
 * @typedef {object} TypeCoords
 * @property {number} coords.col - Столбец (начинается с 0)
 * @property {number} coords.row - Строка (начинается с 0)
 */
const NAME = 'mmtrxmotor';
const PRIMARY_BUS = 'mmtrxmotorBus';
const PROTOCOL = 'mmtrxmotor';
const BUS_NAME_LIST = ['sysBus', 'logBus', PRIMARY_BUS, 'modBusBus'];

const MOTOR_ON = 1;
const MOTOR_OFF = 0;
const CH_RES_MAX_TIME = 750;

class ClassModBusMatrixMotor_S extends ClassBaseService_S {
    /**
     * @typedef {object} TypeMatrixCtrl
     * @property {KC868} rows  
     * @property {KC868} cols 
     */
    // /** @type {Map<string, import('./srvMatrixCtrl').TypeMatrixCtrlAdvOpts>} */
   /** @type {Map<string, { size: { rows: number, cols: number } }>} */
    #_SourceOpts = new Map();

    #_ListenChannels = false;
    /**@type {Map<string, {rows: Array<number>, cols: Array<number>}>} */
    _SwState = new Map();
    #_Events = new EventEmitter2();
    
    constructor({ _busList, _primaryBus, _advOpts }) {
        super({ _name: 'mmtrxmotor', _busNameList: [_primaryBus, ...BUS_NAME_LIST], _busList });
        // this.#_MatrixOpts = _advOpts;
        this.PrimaryBus = _primaryBus ?? PRIMARY_BUS;
        this.#_Events = new EventEmitter2();
        this.FillEventOnList('sysBus', ['all-init-stage1-set']);
        this.FillEventOnList(this.PrimaryBus, [`${NAME}-cmd`, `${NAME}-ch-set`]);
    }

    *Sources() {
        for (let source of Object.values(this.SourcesState)) {
            if (source.Protocol === PROTOCOL && !source.IsConnected && source.CheckProcess && source.Status === 'active')
                yield source;
        };
    }

    async HandlerEvents_all_init_stage1_set(_topic, _msg) {
        super.HandlerEvents_all_init_stage1_set(_topic, _msg);
        // TODO: проверить фильтрацию источников
        for (let source of this.Sources()) {
            const size = {
                rows: this.SourcesState[source.Name].AdvOpts.channels.rows.length,
                cols: this.SourcesState[source.Name].AdvOpts.channels.cols.length
            };
            this.#_SourceOpts.set(source.Name, { 
                size,
            });
            this._SwState.set(source.Name, {
                rows: new Array(size.rows).fill(undefined), 
                cols: new Array(size.cols).fill(undefined)
            });
        }
        this.#_ListenChannels = true;
    }
    /**
     * @method
     * @public
     * @description Отправляет службе mqttclient топик и значение, которое требуется записать
     * @param {string} _topic 
     * @param {*} _msg 
     */
    async HandlerEvents_mmtrxmotor_cmd(_topic, msg) {
        const { hash } = msg.metadata;
        const [ sourceName ] = msg.arg;
        const [{ cmd, args, target }] = msg.value;

        let error = false; 

        switch (cmd) {
            case 'On':
                try {
                    await this.On(sourceName, target, ...args);
                } catch (e) {
                    this.EmitEvents_logger_log({ msg: `[Matrx] error: ${e}`, obj: e });
                    error = true;
                    // TODO: log
                }
                break;

            case 'Off':
                try {
                    await this.Off(sourceName, target, ...args);
                } catch (e) {
                    this.EmitEvents_logger_log({ msg: `[Matrx] error: ${e}`, obj: e });
                    error = true;
                }
                break;
            default:
                break;
        }
        let resArg = [sourceName];
        let resValue = { ...msg.value[0], error };
        this.EmitEvents_proxymmtrxmotor_res({ hash, arg: resArg, value: [resValue] });
    }

    HandlerEvents_mmtrxmotor_ch_set(_topic, _msg) {
        const sourceName = _msg.arg[0];
        const [axis, chNum] = _msg.value[0].arg; // axis is 'rows' | 'cols'
        const value = _msg.value[0].value[0];

        if (this.#_ListenChannels) {
            const state = this._SwState.get(sourceName);
            if (state && state[axis]) {
                state[axis][chNum] = value;
                this.#_Events.emit(`${sourceName}.${axis}.${chNum}.value`, value);
            }
        }
    }

    EmitEvents_proxymmtrxmotor_res({ hash, arg, value }) {
        const msg = {
            // hash,
            dest: 'proxymmtrxmotor',
            com: 'proxymmtrxmotor-res',
            arg,
            value
        };
        
        this.EmitMsg(this.PrimaryBus, msg.com, msg);
    }

    /**
     * Converts a linear index to row and column indices.
     * @param {string} sourceName 
     * @param {number} index The linear index (0-based).
     * @param {number} width The number of columns in the grid.
     * @returns {{row: number, column: number}} An object containing the row and column.
     */
    IndexToPos(sourceName, index) {
        let width = this.#_SourceOpts.get(sourceName).size.cols;
        // let width = this.#_MatrixOpts[sourceName].col.channels.length;
        
        return { row: Math.floor(index / width), col: index % width };
    }

    /**
     * @method
     * @param {string} sourceName 
     * @param {number} index
     * @param {object} opts
     * @param {number} opts.step
     * 
     * @returns {Promise<boolean>}
     */
    async On(sourceName, index, opts) {
        // TODO: проверять index на валидность
        let { step } = opts ?? {};
        let { col, row } = this.IndexToPos(sourceName, index);
        let mtrxOpts = this.SourcesState[sourceName].AdvOpts;
        const sourceAxis = typeof mtrxOpts.sourceAxis =='boolean' ? mtrxOpts.sourceAxis : 'rows';
        const sourceIsRow = sourceAxis == 'rows';
        const gndAxis = sourceIsRow ? 'cols' : 'rows';

        let srcSwChNum = sourceIsRow ? row : col;
        let gndSwChNum = sourceIsRow ? col : row;

        switch (step) {
            case 1:
                return await this.Switch(sourceName, sourceAxis, srcSwChNum, MOTOR_ON);
            case 2:
                return await this.Switch(sourceName, gndAxis, gndSwChNum, MOTOR_ON);
            default:
                return Promise.reject(`Invaild request: step must be specified and be in range 1..2`);
        }
    }

    /**
     * @method
     * @param {string} sourceName 
     * @param {number} index
     * @param {object} opts
     * @param {number} opts.step
     * 
     * @returns {Promise<boolean>}
     */
    async Off(sourceName, index, opts) {
        let { step } = opts ?? {};
        if (typeof index != 'number') {
            return await this.SwitchOffAll(sourceName);
        }
        let { col, row } = this.IndexToPos(sourceName, index);
        let mtrxOpts = this.SourcesState[sourceName].AdvOpts;
        const sourceAxis = typeof mtrxOpts.sourceAxis =='boolean' ? mtrxOpts.sourceAxis : 'rows';
        const sourceIsRow = sourceAxis == 'rows';
        const gndAxis = sourceIsRow ? 'cols' : 'rows';

        let srcSwChNum = sourceIsRow ? row : col;
        let gndSwChNum = sourceIsRow ? col : row;

        switch (step) {
            case undefined:
                return await this.SwitchOffAll(sourceName);
            case 1:
                return await this.Switch(sourceName, sourceAxis, srcSwChNum, MOTOR_OFF);
            case 2:
                return await this.Switch(sourceName, gndAxis, gndSwChNum, MOTOR_OFF);
            default:
                return Promise.reject(`Invaild request: step must be specified and be in range 1..2`);
        }
    }

    async SwitchOffAll(sourceName) {
        for (let rowNum = 0; rowNum < this.#_SourceOpts.get(sourceName).size.rows; rowNum++) {
            try {
                await this.Switch(sourceName, 'rows', rowNum, MOTOR_OFF);
                // console.log(`[Matrix] ${sourceName} row ${rowNum} OFF`);
            } catch (e) {
                this.EmitEvents_logger_log({ msg: `[Matrix] failed to ${sourceName} row ${rowNum} OFF` });
            }
        }
        for (let colNum = 0; colNum < this.#_SourceOpts.get(sourceName).size.cols; colNum++ ) {
            try {
                await this.Switch(sourceName, 'cols', colNum, MOTOR_OFF);
                // console.log(`[Matrix] ${sourceName} col ${colNum} OFF`);
            } catch (e) {
                this.EmitEvents_logger_log({ msg: `[Matrix] failed to ${sourceName} col ${colNum} OFF` });
            }
        }
    }

    async OffEmergency() {

    }
    /**
     * 
     * @param {string} sourceName 
     * @param {string} axis
     * @param {number} chNum 
     * @param {number} value 
     */
    async Switch(sourceName, axis, chNum, value) {
        const msg = {
            com: `proxymmtrxmotor-cmd`,
            dest: 'proxymmtrxmotor',
            arg: [sourceName],
            value: [{
                arg: [axis, chNum],
                value: [value],
            }]
        }
        this.EmitMsg(this.PrimaryBus, msg.com, msg);
        
        const mtrxOpts = this.SourcesState[sourceName].AdvOpts;
        const sourceIsRow = mtrxOpts.sourceAxis === 'rows';

        const state = this._SwState.get(sourceName);
        if (state?.[axis]?.[chNum] === value) return;

        await this.#_Events.waitFor(`${sourceName}.${axis}.${chNum}.value`, {
            timeout: CH_RES_MAX_TIME,
            filter: (v) => v === value
        });
    } 
}

module.exports = ClassModBusMatrixMotor_S;