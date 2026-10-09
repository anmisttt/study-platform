package lab;

import java.math.BigDecimal;
import java.time.Instant;

public record EnrichedPurchase(
        String purchaseId,
        String currency,
        BigDecimal amount,
        BigDecimal usdAmount,
        BigDecimal rateUsed,
        Instant rateAt,
        Instant purchasedAt) {}
