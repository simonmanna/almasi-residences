-- At most one ACTIVE reservation per residence. hold() already serialises on the
-- unit row; this makes the rule hold for every writer. Fails loudly if a
-- residence already has two active holds: close one before deploying.
CREATE UNIQUE INDEX "Reservation_one_active_per_unit" ON "Reservation"("unitId") WHERE (status = 'ACTIVE');
