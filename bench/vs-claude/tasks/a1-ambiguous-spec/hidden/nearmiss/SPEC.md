# Log Export - reference spec (grader self-test only)
## Open questions and assumptions
1. Exporting full client IP and username contradicts the rule that no personal data may leave the platform unmasked. Assumption: mask by default; unmasked only for an approved forensic role.
2. Does "last month" mean the previous calendar month or rolling 30 days, and in which time zone? Assumption: previous calendar month, UTC+7.
3. Exporting everything within 5 seconds is not feasible for large volume. Assumption: async export with a size limit.
4. How is a manager's team defined - Active Directory groups, HR system or branch? Assumption: AD group per branch.
5. Keeping exports forever conflicts with deleting personal data older than 12 months. Assumption: exports expire after 12 months.
