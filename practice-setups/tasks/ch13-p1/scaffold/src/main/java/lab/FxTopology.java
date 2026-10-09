package lab;

import org.apache.kafka.streams.Topology;

public final class FxTopology {
    public static final String RATES_TOPIC = "fx.rates";
    public static final String PURCHASES_TOPIC = "fx.purchases";
    public static final String OUTPUT_TOPIC = "fx.purchase-usd";

    private FxTopology() {}

    public static Topology buildTopology() {
        // TODO: stream-table topology
        throw new UnsupportedOperationException("Implement the topology");
    }

    static EnrichedPurchase enrich(Purchase purchase, Rate rate) {
        // TODO: FX conversion
        throw new UnsupportedOperationException("Implement enrichment");
    }
}
