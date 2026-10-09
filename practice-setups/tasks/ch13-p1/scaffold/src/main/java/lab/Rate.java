package lab;

import java.math.BigDecimal;
import java.time.Instant;

public record Rate(String currency, BigDecimal usdPerUnit, Instant effectiveAt) {}
