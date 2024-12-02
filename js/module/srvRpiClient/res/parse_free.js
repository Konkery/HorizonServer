const input = `
               total        used        free      shared  buff/cache   available
Mem:           4.0Gi       2.6Gi       291Mi       5.9Mi       1.1Gi       1.3Gi
Swap:          199Mi       137Mi        62Mi
`;

function parseMemoryInfo(input) {
    const lines = input.trim().split('\n');
    const memLine = lines[1].split(/\s+/);
    const swapLine = lines[2].split(/\s+/);

    const memInfo = {
        total: memLine[1],
        used: memLine[2],
        free: memLine[3],
        shared: memLine[4],
        buff_cache: memLine[5],
        available: memLine[6]
    };

    const swapInfo = {
        total: swapLine[1],
        used: swapLine[2],
        free: swapLine[3]
    };

    return { memInfo, swapInfo };
}

const result = parseMemoryInfo(input);
console.log(result);
