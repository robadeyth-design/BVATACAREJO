# Security Specification — BV Atacarejo Stock Control

## Data Invariants
1. An operator cannot mutate historical transactions. Once created, transactions are strictly immutable.
2. A product ID, category ID, or transaction ID must be alphanumeric and under 128 characters to avoid Denial of Wallet or resource poisoning.
3. Quantities for active product batches and any registered transaction must be strict, positive numbers.

## The "Dirty Dozen" Threat Vectors
1. **Unsigned-in Read**: Trying to read products as an unauthenticated guest.
2. **Unsigned-in Write**: Injecting an arbitrary category without Auth headers.
3. **Ghost Identifier Injection**: Creating a product document with a huge random string of 1MB (Resource Poisoning) as its ID.
4. **Historical Override**: Attempting to delete a historical transaction log.
5. **Quantity Poisoning**: Mutating a batch's quantity to a negative number or extremely high numbers.
6. **Privilege Overreach**: Altering the fields of a product when auth token lists empty claims.
7. **Shadow fields in Category**: Writing extra properties `isAdmin: true` inside a standard Category document.
8. **Invalid Format Barcode**: Injecting non-alphanumeric characters into barcodes.
9. **Fake User Account Assignment**: Forcing creation or modification of a document pretending to be someone else.
10. **Transaction Alteration**: Attempting to update a transaction type in-place from `saida` to `entrada`.
11. **Expired Batch Addition**: Forcing addition of a batch with empty keys.
12. **Blanket Collection Scraping**: Querying the full database without passing standard query filters.

All these threat vectors are strictly blocked by our zero-trust secure custom functions defined in `firestore.rules`.
