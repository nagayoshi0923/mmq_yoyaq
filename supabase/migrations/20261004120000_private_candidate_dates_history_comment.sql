-- 整備 5: 貸切の候補表は申請時の履歴と定義に明記する（説明の変更のみ。データ・権限は変えない）
-- 確定した日時は承認で作られた公演（schedule_events）と予約側の確定候補が正。この表の行を確定日時として読まない。
COMMENT ON TABLE public.private_group_candidate_dates IS
  '主催者が設定する候補日時（最大6件）。申請時の履歴であり、確定した日時の正本ではない。確定日時は承認で作られた公演（schedule_events）と reservations.candidate_datetimes の確定候補を読む';
