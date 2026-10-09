package lab;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Properties;
import org.apache.kafka.common.serialization.Serdes;
import org.apache.kafka.streams.StreamsConfig;
import org.apache.kafka.streams.TestInputTopic;
import org.apache.kafka.streams.TestOutputTopic;
import org.apache.kafka.streams.TopologyTestDriver;

public final class FxTopologyVerification {
    private FxTopologyVerification() {}

    public static void main(String[] args) {
        Properties properties = new Properties();
        properties.put(StreamsConfig.APPLICATION_ID_CONFIG, "fx-topology-verification");
        properties.put(StreamsConfig.BOOTSTRAP_SERVERS_CONFIG, "dummy:9092");

        try (TopologyTestDriver driver = new TopologyTestDriver(FxTopology.buildTopology(), properties)) {
            JsonSerde<Rate> rateSerde = new JsonSerde<>(Rate.class);
            JsonSerde<Purchase> purchaseSerde = new JsonSerde<>(Purchase.class);
            JsonSerde<EnrichedPurchase> enrichedSerde = new JsonSerde<>(EnrichedPurchase.class);
            TestInputTopic<String, Rate> rates = driver.createInputTopic(
                    FxTopology.RATES_TOPIC, Serdes.String().serializer(), rateSerde.serializer());
            TestInputTopic<String, Purchase> purchases = driver.createInputTopic(
                    FxTopology.PURCHASES_TOPIC, Serdes.String().serializer(), purchaseSerde.serializer());
            TestOutputTopic<String, EnrichedPurchase> output = driver.createOutputTopic(
                    FxTopology.OUTPUT_TOPIC, Serdes.String().deserializer(), enrichedSerde.deserializer());

            rates.pipeInput("EUR", new Rate(
                    "EUR", new BigDecimal("1.10"), Instant.parse("2024-06-01T09:00:00Z")));
            rates.pipeInput("GBP", new Rate(
                    "GBP", new BigDecimal("1.25"), Instant.parse("2024-06-01T09:00:00Z")));
            rates.pipeInput("EUR", new Rate(
                    "EUR", new BigDecimal("1.12"), Instant.parse("2024-06-01T10:00:00Z")));
            rates.pipeInput("CAD", new Rate(
                    "CAD", new BigDecimal("1.005"), Instant.parse("2024-06-01T10:05:00Z")));
            purchases.pipeInput("EUR", new Purchase(
                    "p1", "EUR", new BigDecimal("100.00"), Instant.parse("2024-06-01T10:15:00Z")));
            purchases.pipeInput("GBP", new Purchase(
                    "p2", "GBP", new BigDecimal("40.00"), Instant.parse("2024-06-01T10:16:00Z")));
            purchases.pipeInput("EUR", new Purchase(
                    "p3", "EUR", new BigDecimal("50.00"), Instant.parse("2024-06-01T10:17:00Z")));
            purchases.pipeInput("CAD", new Purchase(
                    "p4", "CAD", new BigDecimal("1.00"), Instant.parse("2024-06-01T10:18:00Z")));
            purchases.pipeInput("JPY", new Purchase(
                    "p5", "JPY", new BigDecimal("1000.00"), Instant.parse("2024-06-01T10:19:00Z")));

            Map<String, EnrichedPurchase> rows = new HashMap<>();
            output.readKeyValuesToList().forEach(row -> rows.put(row.value.purchaseId(), row.value));
            check(rows.size() == 4, "expected four matched purchases");
            check(rows.get("p1").usdAmount().compareTo(new BigDecimal("112.00")) == 0, "p1 amount");
            check(rows.get("p2").usdAmount().compareTo(new BigDecimal("50.00")) == 0, "p2 amount");
            check(rows.get("p3").usdAmount().compareTo(new BigDecimal("56.00")) == 0, "p3 amount");
            check(rows.get("p4").usdAmount().equals(new BigDecimal("1.01")), "p4 rounded amount");
            check(!rows.containsKey("p5"), "unmatched purchase must not be emitted");
            check(rows.get("p1").rateUsed().compareTo(new BigDecimal("1.12")) == 0, "latest EUR rate");
            check(rows.get("p1").rateAt().equals(Instant.parse("2024-06-01T10:00:00Z")), "rate timestamp");
            check(rows.get("p1").currency().equals("EUR"), "p1 currency");
            check(rows.get("p2").currency().equals("GBP"), "p2 currency");
            check(rows.get("p1").amount().compareTo(new BigDecimal("100.00")) == 0, "p1 original amount");
            check(rows.get("p3").amount().compareTo(new BigDecimal("50.00")) == 0, "p3 original amount");
            check(rows.get("p1").purchasedAt().equals(Instant.parse("2024-06-01T10:15:00Z")), "p1 purchase timestamp");
            check(rows.get("p2").purchasedAt().equals(Instant.parse("2024-06-01T10:16:00Z")), "p2 purchase timestamp");
        }
        System.out.println("verification passed");
    }

    private static void check(boolean condition, String label) {
        if (!condition) {
            throw new AssertionError(label);
        }
    }
}
