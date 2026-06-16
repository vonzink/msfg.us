# Funnel Hand-off — Part A: mortgage-app Borrower Intake Endpoint

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a borrower-facing `POST /loan-applications/intake` endpoint to the mortgage-app Spring Boot backend that creates a `REGISTERED`, borrower-owned loan application prefilled from the msfg.us apply funnel, idempotent on `sourceLeadId`, with the chosen loan officer resolved by email.

**Architecture:** A new controller method + service method, distinct from the existing LO/Admin-only `POST /loan-applications`. Any authenticated user (borrower) creates *their own* application. The caller is resolved from the Cognito JWT via `CurrentUserService`; the primary borrower is linked to the caller (`borrowers.user_id`); idempotency is enforced by a new unique `loan_applications.source_lead_id` column.

**Tech Stack:** Java 17, Spring Boot 3.2 (Web, Security/OAuth2 resource server, Data JPA), Flyway, H2 (test) / Postgres (prod), JUnit 5 + MockMvc + spring-security-test, Lombok.

**Repo:** `/Users/zacharyzink/MSFG/WebProjects/mortgage-app/backend` (all paths below are relative to it). **This is a different repo from msfg.us** — `cd` there to run commands.

**IntakeRequest contract (provider side of the spec's IntakeDTO):**
```jsonc
POST /api/loan-applications/intake   Authorization: Bearer <cognito id_token>
{
  "sourceLeadId": "uuid", "source": "apply-wizard",
  "intent": "buy|refi|cash", "loanPurpose": "Purchase|Refinance|CashOut",
  "borrower": { "firstName","lastName","email","phone" },
  "property": { "addressLine","city","state","zipCode",
                "propertyType":"PrimaryResidence|SecondHome|Investment|null",
                "constructionType":"SiteBuilt|Manufactured|null", "propertyValue": 0 },
  "financials": { "currentMortgageBalance": 0, "annualIncome": 0, "creditBand": "" },
  "loanOfficer": { "email","nmls","name","slug" }   // nullable
}
→ 200 { "applicationId": "<id>" }   // SAME id on retry (idempotent on sourceLeadId)
```

---

## File Structure

- **Create** `src/main/resources/db/migration/V27__loan_application_source_lead_id.sql` — add unique `source_lead_id`.
- **Modify** `src/main/java/com/msfg/mortgage/model/LoanApplication.java` — add `sourceLeadId` field.
- **Modify** `src/main/java/com/msfg/mortgage/repository/LoanApplicationRepository.java` — add `findBySourceLeadId`.
- **Create** `src/main/java/com/msfg/mortgage/dto/IntakeRequest.java` — the intake DTO (+ nested `BorrowerInfo`, `PropertyInfo`, `Financials`, `LoanOfficerInfo`).
- **Modify** `src/main/java/com/msfg/mortgage/service/LoanApplicationService.java` — add `createFromIntake(IntakeRequest, User)`.
- **Modify** `src/main/java/com/msfg/mortgage/controller/LoanApplicationController.java` — add `POST /intake`.
- **Create** `src/test/java/com/msfg/mortgage/controller/LoanApplicationIntakeControllerTest.java` — endpoint tests.

> **Confirm-before-coding (gaps the explorer left):**
> - The exact accessor on `Borrower` for the user link (`borrowers.user_id` from V3 migration). Open `model/Borrower.java`; it is likely `private Integer userId;` with `setUserId(...)`. Use the real accessor.
> - Whether `Borrower` references the application via `setApplication(...)` (the service's `buildBorrower` pattern). Reuse the existing `buildBorrower` if present.

---

### Task 1: Flyway migration — `source_lead_id`

**Files:**
- Create: `src/main/resources/db/migration/V27__loan_application_source_lead_id.sql`

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================================
-- V27: loan_applications.source_lead_id
--
-- External idempotency key for applications created via the borrower intake
-- endpoint (POST /loan-applications/intake) from the msfg.us apply funnel.
-- UNIQUE so a retried hand-off (or a double-fired client effect) collapses to
-- one application instead of creating duplicates. NULL for all app-created
-- rows. One statement per line (H2 PG-mode quirk).
-- ============================================================================

ALTER TABLE loan_applications ADD COLUMN source_lead_id VARCHAR(100);

CREATE UNIQUE INDEX ux_loan_applications_source_lead_id
    ON loan_applications(source_lead_id);
```

> Note: a partial/filtered unique index is ideal (allow many NULLs) but H2 PG-mode + Postgres both treat multiple NULLs as distinct under a plain UNIQUE index, so `NULL` rows won't collide. Keep it plain.

- [ ] **Step 2: Verify the app boots (Flyway applies the migration)**

Run: `cd /Users/zacharyzink/MSFG/WebProjects/mortgage-app/backend && ./mvnw -q test -Dtest=LoanApplicationListControllerTest`
Expected: PASS (the existing test boots the context against H2; Flyway runs V27 cleanly — no error like "migration checksum" or "syntax").

- [ ] **Step 3: Commit**

```bash
git add src/main/resources/db/migration/V27__loan_application_source_lead_id.sql
git commit -m "feat(db): V27 add unique loan_applications.source_lead_id for funnel intake idempotency"
```

---

### Task 2: Entity field `sourceLeadId`

**Files:**
- Modify: `src/main/java/com/msfg/mortgage/model/LoanApplication.java` (near `assignedLoName`, ~line 64)

- [ ] **Step 1: Add the field** (place after the `assigned_lo_name` column)

```java
/**
 * External idempotency key from the msfg.us apply funnel (the Postgres lead id).
 * UNIQUE; NULL for app-created applications. Set only by the borrower intake
 * endpoint so a retried hand-off resolves to the existing application.
 */
@Column(name = "source_lead_id", unique = true)
private String sourceLeadId;
```

If the class uses Lombok `@Data`/`@Getter`/`@Setter` (check the class annotations at the top), the accessors are generated. If it uses hand-written getters/setters, add:

```java
public String getSourceLeadId() { return sourceLeadId; }
public void setSourceLeadId(String sourceLeadId) { this.sourceLeadId = sourceLeadId; }
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/zacharyzink/MSFG/WebProjects/mortgage-app/backend && ./mvnw -q compile`
Expected: BUILD SUCCESS.

- [ ] **Step 3: Commit**

```bash
git add src/main/java/com/msfg/mortgage/model/LoanApplication.java
git commit -m "feat(model): LoanApplication.sourceLeadId"
```

---

### Task 3: Repository lookup `findBySourceLeadId`

**Files:**
- Modify: `src/main/java/com/msfg/mortgage/repository/LoanApplicationRepository.java`

- [ ] **Step 1: Add the finder** (inside the interface body)

```java
java.util.Optional<LoanApplication> findBySourceLeadId(String sourceLeadId);
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/zacharyzink/MSFG/WebProjects/mortgage-app/backend && ./mvnw -q compile`
Expected: BUILD SUCCESS.

- [ ] **Step 3: Commit**

```bash
git add src/main/java/com/msfg/mortgage/repository/LoanApplicationRepository.java
git commit -m "feat(repo): findBySourceLeadId for intake idempotency"
```

---

### Task 4: `IntakeRequest` DTO

**Files:**
- Create: `src/main/java/com/msfg/mortgage/dto/IntakeRequest.java`

- [ ] **Step 1: Write the DTO** (Lombok `@Data`; nested static records for the sub-objects)

```java
package com.msfg.mortgage.dto;

import jakarta.validation.constraints.NotBlank;
import java.math.BigDecimal;
import lombok.Data;

/**
 * Borrower-funnel intake payload from msfg.us (POST /loan-applications/intake).
 * Intentionally decoupled from LoanApplicationDTO: the service maps this onto
 * the loan-application graph. Nullable fields tolerate a partial funnel.
 */
@Data
public class IntakeRequest {
    @NotBlank private String sourceLeadId;     // idempotency key (Postgres lead id)
    private String source;                     // e.g. "apply-wizard"
    private String intent;                     // buy | refi | cash
    @NotBlank private String loanPurpose;      // Purchase | Refinance | CashOut
    private BorrowerInfo borrower;
    private PropertyInfo property;
    private Financials financials;
    private LoanOfficerInfo loanOfficer;       // nullable

    @Data public static class BorrowerInfo {
        private String firstName; private String lastName; private String email; private String phone;
    }
    @Data public static class PropertyInfo {
        private String addressLine; private String city; private String state; private String zipCode;
        private String propertyType;      // PrimaryResidence | SecondHome | Investment
        private String constructionType;  // SiteBuilt | Manufactured
        private BigDecimal propertyValue;
    }
    @Data public static class Financials {
        private BigDecimal currentMortgageBalance; private BigDecimal annualIncome; private String creditBand;
    }
    @Data public static class LoanOfficerInfo {
        private String email; private String nmls; private String name; private String slug;
    }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/zacharyzink/MSFG/WebProjects/mortgage-app/backend && ./mvnw -q compile`
Expected: BUILD SUCCESS.

- [ ] **Step 3: Commit**

```bash
git add src/main/java/com/msfg/mortgage/dto/IntakeRequest.java
git commit -m "feat(dto): IntakeRequest for borrower funnel hand-off"
```

---

### Task 5: Service `createFromIntake` (TDD)

**Files:**
- Modify: `src/main/java/com/msfg/mortgage/service/LoanApplicationService.java`
- Test: `src/test/java/com/msfg/mortgage/service/LoanApplicationIntakeServiceTest.java` (create)

- [ ] **Step 1: Write the failing test**

```java
package com.msfg.mortgage.service;

import com.msfg.mortgage.dto.IntakeRequest;
import com.msfg.mortgage.model.LoanApplication;
import com.msfg.mortgage.model.LoanStatus;
import com.msfg.mortgage.model.User;
import com.msfg.mortgage.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class LoanApplicationIntakeServiceTest {

    @Autowired private LoanApplicationService service;
    @Autowired private UserRepository userRepository;

    private IntakeRequest sampleRefi(String leadId) {
        IntakeRequest r = new IntakeRequest();
        r.setSourceLeadId(leadId);
        r.setSource("apply-wizard");
        r.setIntent("refi");
        r.setLoanPurpose("Refinance");
        IntakeRequest.BorrowerInfo b = new IntakeRequest.BorrowerInfo();
        b.setFirstName("Zachary"); b.setLastName("Zink");
        b.setEmail("borrower@example.com"); b.setPhone("3035551234");
        r.setBorrower(b);
        IntakeRequest.PropertyInfo p = new IntakeRequest.PropertyInfo();
        p.setAddressLine("12750 W 88th Ave"); p.setCity("Arvada"); p.setState("CO"); p.setZipCode("80005");
        p.setPropertyType("PrimaryResidence"); p.setConstructionType("SiteBuilt");
        p.setPropertyValue(new BigDecimal("485000"));
        r.setProperty(p);
        IntakeRequest.Financials f = new IntakeRequest.Financials();
        f.setCurrentMortgageBalance(new BigDecimal("312000")); f.setAnnualIncome(new BigDecimal("120000"));
        f.setCreditBand("Good (680–739)");
        r.setFinancials(f);
        return r;
    }

    private User borrower() {
        return userRepository.save(User.builder()
                .email("borrower@example.com").name("Zachary Zink").role("borrower")
                .cognitoSub("sub-borrower").build());
    }

    @Test
    void createsRegisteredApplicationOwnedByCaller() {
        User caller = borrower();
        LoanApplication app = service.createFromIntake(sampleRefi("lead-1"), caller);

        assertThat(app.getId()).isNotNull();
        assertThat(app.getStatus()).isEqualTo(LoanStatus.REGISTERED.name());
        assertThat(app.getLoanPurpose()).isEqualTo("Refinance");
        assertThat(app.getSourceLeadId()).isEqualTo("lead-1");
        assertThat(app.getProperty().getAddressLine()).isEqualTo("12750 W 88th Ave");
        assertThat(app.getBorrowers()).hasSize(1);
        assertThat(app.getBorrowers().get(0).getEmail()).isEqualTo("borrower@example.com");
        // owner linkage: primary borrower bound to the caller's user id
        assertThat(app.getBorrowers().get(0).getUserId()).isEqualTo(caller.getId());
        // refi mortgage balance becomes a MortgageLoan liability
        assertThat(app.getLiabilities()).anyMatch(l -> "MortgageLoan".equals(l.getLiabilityType()));
    }

    @Test
    void idempotentOnSourceLeadId() {
        User caller = borrower();
        LoanApplication first = service.createFromIntake(sampleRefi("lead-2"), caller);
        LoanApplication second = service.createFromIntake(sampleRefi("lead-2"), caller);
        assertThat(second.getId()).isEqualTo(first.getId());
    }

    @Test
    void resolvesLoanOfficerByEmail() {
        User caller = borrower();
        User lo = userRepository.save(User.builder()
                .email("zachary.zink@msfg.us").name("Zachary Zink").role("lo")
                .cognitoSub("sub-lo").build());
        IntakeRequest r = sampleRefi("lead-3");
        IntakeRequest.LoanOfficerInfo info = new IntakeRequest.LoanOfficerInfo();
        info.setEmail("zachary.zink@msfg.us"); info.setName("Zachary Zink"); info.setNmls("451924");
        r.setLoanOfficer(info);
        LoanApplication app = service.createFromIntake(r, caller);
        assertThat(app.getAssignedLoId()).isEqualTo(lo.getId());
        assertThat(app.getAssignedLoName()).isEqualTo("Zachary Zink");
    }

    @Test
    void unknownLoanOfficerLeavesUnassigned() {
        User caller = borrower();
        IntakeRequest r = sampleRefi("lead-4");
        IntakeRequest.LoanOfficerInfo info = new IntakeRequest.LoanOfficerInfo();
        info.setEmail("nobody@msfg.us"); info.setName("Nobody");
        r.setLoanOfficer(info);
        LoanApplication app = service.createFromIntake(r, caller);
        assertThat(app.getAssignedLoId()).isNull();
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /Users/zacharyzink/MSFG/WebProjects/mortgage-app/backend && ./mvnw -q test -Dtest=LoanApplicationIntakeServiceTest`
Expected: FAIL to compile / run — `createFromIntake` does not exist yet.

- [ ] **Step 3: Implement `createFromIntake`**

First open `model/Borrower.java` and confirm the user-link accessor (expected `setUserId(Integer)`) and the `incomeSources`/`employmentHistory` shape. Then add to `LoanApplicationService` (reuse the existing `mapper`, `buildBorrower`, and `loanApplicationRepository` fields):

```java
@Autowired private com.msfg.mortgage.repository.UserRepository userRepository;

/**
 * Create a REGISTERED, borrower-owned application from the msfg.us funnel.
 * Idempotent on sourceLeadId. Loan officer resolved by email (unknown → null).
 */
@Transactional
public LoanApplication createFromIntake(IntakeRequest req, User caller) {
    // 1) Idempotency: return the existing application for this lead.
    var existing = loanApplicationRepository.findBySourceLeadId(req.getSourceLeadId());
    if (existing.isPresent()) return existing.get();

    // 2) Build the application graph.
    LoanApplication app = new LoanApplication();
    app.setLoanPurpose(req.getLoanPurpose());
    app.setStatus(LoanStatus.REGISTERED.name());
    app.setSourceLeadId(req.getSourceLeadId());

    IntakeRequest.PropertyInfo pi = req.getProperty();
    if (pi != null) {
        Property prop = new Property();
        prop.setAddressLine(pi.getAddressLine());
        prop.setCity(pi.getCity());
        prop.setState(pi.getState());
        prop.setZipCode(pi.getZipCode());
        prop.setPropertyType(pi.getPropertyType());
        prop.setConstructionType(pi.getConstructionType());
        prop.setPropertyValue(pi.getPropertyValue());
        prop.setApplication(app);
        app.setProperty(prop);
        app.setPropertyValue(pi.getPropertyValue());
    }

    IntakeRequest.BorrowerInfo bi = req.getBorrower();
    if (bi != null) {
        Borrower b = new Borrower();
        b.setSequenceNumber(1);
        b.setFirstName(bi.getFirstName());
        b.setLastName(bi.getLastName());
        b.setEmail(bi.getEmail());
        b.setPhone(bi.getPhone());
        b.setUserId(caller.getId());           // owner linkage (borrowers.user_id, V3)
        b.setApplication(app);
        app.setBorrowers(new java.util.ArrayList<>(java.util.List.of(b)));
    }

    // refi/cash existing mortgage → a MortgageLoan liability
    if (req.getFinancials() != null && req.getFinancials().getCurrentMortgageBalance() != null) {
        Liability l = new Liability();
        l.setLiabilityType("MortgageLoan");
        l.setBalanceAmount(req.getFinancials().getCurrentMortgageBalance());
        l.setApplication(app);
        app.setLiabilities(new java.util.ArrayList<>(java.util.List.of(l)));
    }

    // 3) Resolve the chosen loan officer by email (best-effort).
    if (req.getLoanOfficer() != null && req.getLoanOfficer().getEmail() != null) {
        userRepository.findByEmail(req.getLoanOfficer().getEmail()).ifPresent(lo -> {
            app.setAssignedLoId(lo.getId());
            app.setAssignedLoName(req.getLoanOfficer().getName() != null
                    ? req.getLoanOfficer().getName() : lo.getName());
        });
    }

    // 4) Save (cascade). Catch a concurrent-create unique violation → return existing.
    try {
        return loanApplicationRepository.save(app);
    } catch (org.springframework.dao.DataIntegrityViolationException dup) {
        return loanApplicationRepository.findBySourceLeadId(req.getSourceLeadId())
                .orElseThrow(() -> dup);
    }
}
```

Add the needed imports (`IntakeRequest`, `Property`, `Borrower`, `Liability`, `LoanStatus`, `User`). If `Borrower`'s user link is a `@ManyToOne User user` instead of a scalar `userId`, set `b.setUser(caller)` instead — use whichever the model defines.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /Users/zacharyzink/MSFG/WebProjects/mortgage-app/backend && ./mvnw -q test -Dtest=LoanApplicationIntakeServiceTest`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/java/com/msfg/mortgage/service/LoanApplicationService.java \
        src/test/java/com/msfg/mortgage/service/LoanApplicationIntakeServiceTest.java
git commit -m "feat(service): createFromIntake — REGISTERED borrower-owned app, idempotent, LO by email"
```

---

### Task 6: Controller `POST /loan-applications/intake` (TDD)

**Files:**
- Modify: `src/main/java/com/msfg/mortgage/controller/LoanApplicationController.java`
- Test: `src/test/java/com/msfg/mortgage/controller/LoanApplicationIntakeControllerTest.java` (create)

> **Auth note:** `CurrentUserService.currentUser()` requires a `JwtAuthenticationToken`, so the test MUST authenticate with the `jwt()` request post-processor (NOT `@WithMockUser`, which produces a non-JWT auth and would resolve to no user).

- [ ] **Step 1: Write the failing test**

```java
package com.msfg.mortgage.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class LoanApplicationIntakeControllerTest {

    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper om;

    private static final String BODY = """
        { "sourceLeadId":"lead-ctrl-1","source":"apply-wizard","intent":"refi","loanPurpose":"Refinance",
          "borrower":{"firstName":"Zachary","lastName":"Zink","email":"borrower@example.com","phone":"3035551234"},
          "property":{"addressLine":"12750 W 88th Ave","city":"Arvada","state":"CO","zipCode":"80005",
                      "propertyType":"PrimaryResidence","constructionType":"SiteBuilt","propertyValue":485000},
          "financials":{"currentMortgageBalance":312000,"annualIncome":120000,"creditBand":"Good"},
          "loanOfficer":null }
        """;

    private static org.springframework.test.web.servlet.request.RequestPostProcessor borrowerJwt() {
        return jwt().jwt(j -> j.subject("sub-borrower")
                              .claim("email", "borrower@example.com")
                              .claim("name", "Zachary Zink")
                              .claim("cognito:groups", java.util.List.of("Borrower")))
                    .authorities(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_Borrower"));
    }

    @Test
    void unauthenticatedIs401() throws Exception {
        mvc.perform(post("/loan-applications/intake").contentType(MediaType.APPLICATION_JSON).content(BODY))
           .andExpect(status().isUnauthorized());
    }

    @Test
    void createsApplicationAndReturnsId() throws Exception {
        MvcResult res = mvc.perform(post("/loan-applications/intake")
                .with(borrowerJwt()).contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode body = om.readTree(res.getResponse().getContentAsString());
        assertThat(body.get("applicationId").asLong()).isPositive();
    }

    @Test
    void idempotentReturnsSameId() throws Exception {
        MvcResult a = mvc.perform(post("/loan-applications/intake")
                .with(borrowerJwt()).contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isOk()).andReturn();
        MvcResult b = mvc.perform(post("/loan-applications/intake")
                .with(borrowerJwt()).contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isOk()).andReturn();
        long idA = om.readTree(a.getResponse().getContentAsString()).get("applicationId").asLong();
        long idB = om.readTree(b.getResponse().getContentAsString()).get("applicationId").asLong();
        assertThat(idB).isEqualTo(idA);
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /Users/zacharyzink/MSFG/WebProjects/mortgage-app/backend && ./mvnw -q test -Dtest=LoanApplicationIntakeControllerTest`
Expected: FAIL — no `/loan-applications/intake` mapping (404 / status mismatch).

- [ ] **Step 3: Add the controller method** (inject `CurrentUserService currentUserService` via the existing `@RequiredArgsConstructor`; add a `final CurrentUserService currentUserService;` field if not already present)

```java
@PostMapping("/intake")
@PreAuthorize("isAuthenticated()")
public ResponseEntity<Map<String, Object>> intake(@Valid @RequestBody IntakeRequest req) {
    User caller = currentUserService.currentUser()
            .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(
                    HttpStatus.UNAUTHORIZED, "No authenticated user"));
    log.info("Funnel intake: leadId={} purpose={}", req.getSourceLeadId(), req.getLoanPurpose());
    LoanApplication app = loanApplicationService.createFromIntake(req, caller);
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("applicationId", app.getId());
    return ResponseEntity.ok(out);
}
```

Add imports: `com.msfg.mortgage.dto.IntakeRequest`. (`Map`, `LinkedHashMap`, `User`, `CurrentUserService`, `HttpStatus`, `PreAuthorize`, `Valid` are already imported per the existing controller.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /Users/zacharyzink/MSFG/WebProjects/mortgage-app/backend && ./mvnw -q test -Dtest=LoanApplicationIntakeControllerTest`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/java/com/msfg/mortgage/controller/LoanApplicationController.java \
        src/test/java/com/msfg/mortgage/controller/LoanApplicationIntakeControllerTest.java
git commit -m "feat(api): POST /loan-applications/intake — borrower funnel hand-off"
```

---

### Task 7: Full suite green

- [ ] **Step 1: Run the whole backend test suite**

Run: `cd /Users/zacharyzink/MSFG/WebProjects/mortgage-app/backend && ./mvnw -q test`
Expected: BUILD SUCCESS, all tests pass (existing + the new intake service/controller tests).

- [ ] **Step 2: If anything broke,** read the failure and fix before proceeding. Common causes: V27 SQL syntax (H2 PG-mode — one statement per line), a missing import, or a `Borrower` user-link accessor name mismatch (Step-3 confirm note in Task 5).

- [ ] **Step 3: Commit any fixes**

```bash
git add -A && git commit -m "test: backend suite green with intake endpoint"
```

---

## Self-review notes (done)

- **Spec coverage:** intake endpoint ✓ (T6), borrower-owned REGISTERED app ✓ (T5), idempotent on sourceLeadId ✓ (T1/T5/T6), LO-by-email ✓ (T5), mortgage→liability ✓ (T5). The IntakeRequest matches the spec's IntakeDTO contract.
- **Out of scope here (Part B):** msfg.us sends this payload; `LOS_PATH` becomes `/api/loan-applications/intake`. Field *mapping* from the funnel lead lives in Part B.
- **Confirm-points** are explicit (Borrower user-link accessor; whether the service uses a MapStruct `mapper` vs `new` — this plan builds entities directly to avoid coupling to the mapper's nullability).
