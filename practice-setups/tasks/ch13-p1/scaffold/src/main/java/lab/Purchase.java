package lab;

import java.math.BigDecimal;
import java.time.Instant;

public record Purchase(String purchaseId, String currency, BigDecimal amount, Instant purchasedAt) {}
