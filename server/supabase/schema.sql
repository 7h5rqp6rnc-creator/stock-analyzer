-- Supabase Schema for Stock Analyzer
-- Run this SQL in your Supabase SQL Editor

create table if not exists stock_analyses (
  id uuid default gen_random_uuid() primary key,
  symbol text not null,
  stock_data jsonb not null,
  analysis_result jsonb not null,
  sentiment text not null,
  risk_level text not null,
  created_at timestamp with time zone default now()
);

-- Enable Row Level Security
alter table stock_analyses enable row level security;

-- Create policy for public read access
create policy "Public read access" on stock_analyses
  for select using (true);

-- Create policy for public insert access
create policy "Public insert access" on stock_analyses
  for insert with check (true);

-- Create index for faster queries
create index if not exists idx_stock_analyses_symbol on stock_analyses(symbol);
create index if not exists idx_stock_analyses_created_at on stock_analyses(created_at desc);
