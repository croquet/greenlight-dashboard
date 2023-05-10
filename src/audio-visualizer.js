class VisualizerProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.volume = 0;
        this.updateIntervalInMS = 100;
        this.lastUpdateTime = Date.now();
    }

    process(inputs, _outputs, _parameters) {
        let now = Date.now();
        if (now < this.lastUpdateTime + this.updateIntervalInMS) {return true;}
        this.lastUpdateTime = now;
        const input = inputs[0];

        if (input.length > 0) {
            const samples = input[0];
            let max = 0;

            for (let i = 0; i < samples.length; i++) {
                max = Math.max(max, Math.abs(samples[i]));
            }

            max = Math.max((max * 10 - 0.5), 0); // hmm
            this.volume = max;

            this.port.postMessage({volume: this.volume});
        }
        return true;
    }
}

registerProcessor('processor', VisualizerProcessor);
