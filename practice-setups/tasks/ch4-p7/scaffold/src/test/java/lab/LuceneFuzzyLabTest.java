package lab;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.apache.lucene.store.Directory;
import org.junit.jupiter.api.Test;

class LuceneFuzzyLabTest {
    @Test
    void reconstructsEditAlignment() {
        var transposed = LuceneFuzzyLab.align("keyboard", "keybaord");
        assertEquals(1, transposed.distance());
        assertTrue(transposed.edits().contains(LuceneFuzzyLab.Edit.TRANSPOSE));

        var deleted = LuceneFuzzyLab.align("wireless", "wireles");
        assertEquals(1, deleted.distance());
        assertTrue(deleted.edits().contains(LuceneFuzzyLab.Edit.DELETE));
    }

    @Test
    void retrievesTypoTolerantTermsThroughLucene() throws Exception {
        var products = List.of(
                new LuceneFuzzyLab.Product("kbd", "wireless mechanical keyboard"),
                new LuceneFuzzyLab.Product("mouse", "wireless ergonomic mouse"),
                new LuceneFuzzyLab.Product("puller", "ceramic keycap puller")
        );

        try (Directory directory = LuceneFuzzyLab.buildIndex(products)) {
            var hits = LuceneFuzzyLab.search(directory, "wirless keybaord");
            assertEquals("kbd", hits.getFirst().id());
            assertTrue(hits.getFirst().score() > 0);
        }
    }
}
