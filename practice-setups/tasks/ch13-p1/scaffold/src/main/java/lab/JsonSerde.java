package lab;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.apache.kafka.common.errors.SerializationException;
import org.apache.kafka.common.serialization.Deserializer;
import org.apache.kafka.common.serialization.Serdes;
import org.apache.kafka.common.serialization.Serializer;

public final class JsonSerde<T> extends Serdes.WrapperSerde<T> {
    public JsonSerde(Class<T> type) {
        super(new JsonSerializer<>(), new JsonDeserializer<>(type));
    }

    private static ObjectMapper mapper() {
        return new ObjectMapper()
                .registerModule(new JavaTimeModule())
                .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
                .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
    }

    private static final class JsonSerializer<T> implements Serializer<T> {
        private final ObjectMapper mapper = mapper();

        @Override
        public byte[] serialize(String topic, T value) {
            if (value == null) {
                return null;
            }
            try {
                return mapper.writeValueAsBytes(value);
            } catch (Exception error) {
                throw new SerializationException("Could not serialize JSON", error);
            }
        }
    }

    private static final class JsonDeserializer<T> implements Deserializer<T> {
        private final ObjectMapper mapper = mapper();
        private final Class<T> type;

        private JsonDeserializer(Class<T> type) {
            this.type = type;
        }

        @Override
        public T deserialize(String topic, byte[] value) {
            if (value == null) {
                return null;
            }
            try {
                return mapper.readValue(value, type);
            } catch (Exception error) {
                throw new SerializationException("Could not deserialize JSON", error);
            }
        }
    }
}
