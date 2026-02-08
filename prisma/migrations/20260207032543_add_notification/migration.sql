DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM pg_tables
		WHERE schemaname = 'public'
			AND tablename = 'Notification'
	) THEN
		-- DropForeignKey
		ALTER TABLE "Notification" DROP CONSTRAINT IF EXISTS "Notification_toUserId_fkey";

		-- AddForeignKey
		ALTER TABLE "Notification" ADD CONSTRAINT "Notification_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
	END IF;
END $$;
