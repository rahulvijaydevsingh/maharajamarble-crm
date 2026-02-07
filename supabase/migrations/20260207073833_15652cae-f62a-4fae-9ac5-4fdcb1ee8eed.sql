-- Add skip_weekends column to kit_subscriptions
ALTER TABLE kit_subscriptions 
ADD COLUMN skip_weekends BOOLEAN DEFAULT false;