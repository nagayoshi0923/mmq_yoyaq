import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: ['dist', 'supabase/functions/**', 'eslint.config.js'],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
    ],
    plugins: {
      'react-refresh': reactRefresh,
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    linterOptions: {
      // 旧 CLI フラグ --report-unused-disable-directives は error 扱いだったので severity を明示
      reportUnusedDisableDirectives: 'error',
    },
    rules: {
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      // typescript-eslint v8 recommended で新規追加されたルール。
      // 旧 v7 recommended（＝ベースライン 0 error）には存在せずパリティ維持のため off。
      '@typescript-eslint/no-unused-expressions': 'off', // v7 では未検知（三項演算子の文利用など）
      '@typescript-eslint/no-empty-object-type': 'off', // 旧 no-empty-interface 相当・v7 では未検知
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/rules-of-hooks': 'error',
      'no-irregular-whitespace': 'off',
      'no-misleading-character-class': 'off', // 既存コード対応
      'no-case-declarations': 'off', // 既存コード対応
      'no-useless-catch': 'off', // 既存コード対応
      'no-alert': 'error',
      'no-restricted-globals': [
        'error',
        'confirm',
        'prompt',
        'alert',
      ],

      // --- Security guardrails -------------------------------------------------
      // 予約テーブルの直接UPDATE/DELETEはP0事故の温床になりやすいので禁止（RPC経由に統一）
      // 例外が必要な場合は、PRで理由を明記し、代替（RPC化）を検討すること。
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.property.name='update'][callee.object.callee.property.name='from'][callee.object.arguments.0.value='reservations']",
          message:
            "Direct update to 'reservations' is forbidden. Use RPC/API layer (e.g., reservationApi.*WithLock).",
        },
        {
          selector:
            "CallExpression[callee.property.name='delete'][callee.object.callee.property.name='from'][callee.object.arguments.0.value='reservations']",
          message:
            "Direct delete from 'reservations' is forbidden. Use RPC/API layer.",
        },
      ],
    },
  },

  // --- 境界の歯止め（整備計画 Phase 2） -------------------------------------
  // 画面・部品・hook から supabase.from() / supabase.rpc() を直接呼ばない。読み書きは src/lib/api の関数を通す。
  // 既存の直接呼び出しがあるファイルは下の許可リストに載せ、移し終えたら外す（残り件数は docs/MMQ_SEIBI_PLAN_2026-10.md 第3節）。
  {
    files: ['src/pages/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}', 'src/hooks/**/*.{ts,tsx}'],
    ignores: [
      'src/components/BookingDeadlineNotice.tsx',
      'src/components/GlobalCommandPalette.tsx',
      'src/components/auth/LoginForm.tsx',
      'src/components/modals/AddFromMasterDialog.tsx',
      'src/components/modals/MasterSelectDialog.tsx',
      'src/components/modals/ScenarioEditDialogV2.tsx',
      'src/components/modals/ScenarioEditDialogV2/sections/EmailSectionV2.tsx',
      'src/components/modals/StoreEditModal.tsx',
      'src/components/schedule/ImportScheduleModal.tsx',
      'src/components/schedule/SlotMemoInput.tsx',
      'src/components/schedule/modal/SurveyResponsesTab.tsx',
      'src/components/schedule/modal/reservationList/AddParticipantSection.tsx',
      'src/components/schedule/modal/reservationList/ReservationRow.tsx',
      'src/components/schedule/modal/reservationList/useReservationListActions.ts',
      'src/components/schedule/modal/reservationList/useReservationListData.ts',
      'src/hooks/eventOperations/useEventCancel.ts',
      'src/hooks/eventOperations/useEventDelete.ts',
      'src/hooks/eventOperations/useEventSave.ts',
      'src/hooks/useCustomHolidays.ts',
      'src/hooks/useFavorites.ts',
      'src/hooks/useGlobalSettings.ts',
      'src/hooks/useNotifications.ts',
      'src/hooks/useOrganization.ts',
      'src/hooks/usePlayedScenarios.ts',
      'src/hooks/usePrivateBookingDeadlineDays.ts',
      'src/hooks/usePrivateBookingSlotData.ts',
      'src/hooks/usePrivateGroup.ts',
      'src/hooks/useReservationData.ts',
      'src/hooks/useSalarySettings.ts',
      'src/hooks/useScheduleData.ts',
      'src/hooks/useScheduleEventsQuery.ts',
      'src/hooks/useTablePreferences.ts',
      'src/hooks/useTemporaryVenues.ts',
      'src/pages/AddDemoParticipants.tsx',
      'src/pages/BookingConfirmation/hooks/useBookingSubmit.ts',
      'src/pages/BookingConfirmation/hooks/useCustomerData.ts',
      'src/pages/BookingConfirmation/index.tsx',
      'src/pages/CompleteProfile.tsx',
      'src/pages/CouponPresent.tsx',
      'src/pages/ExternalReportForm/index.tsx',
      'src/pages/GMAvailabilityCheck/hooks/useAvailabilityCheck.ts',
      'src/pages/GMAvailabilityCheck/hooks/useResponseSubmit.ts',
      'src/pages/LicenseManagement/tabs/SendReports.tsx',
      'src/pages/LicenseManagement/tabs/sendReports/useSendReportsData.ts',
      'src/pages/LicensePartnerReportForm/index.tsx',
      'src/pages/Manual/index.tsx',
      'src/pages/MyPage/index.tsx',
      'src/pages/MyPage/pages/SettingsPage.tsx',
      'src/pages/OrgSignup/index.tsx',
      'src/pages/OrganizationManagement/index.tsx',
      'src/pages/OrganizationSettings/index.tsx',
      'src/pages/PlatformScenarioSearch/index.tsx',
      'src/pages/PrivateBookingManagement/components/DeliveryHistoryDialog.tsx',
      'src/pages/PrivateBookingManagement/components/PrivateGroupList.tsx',
      'src/pages/PrivateBookingManagement/hooks/useApprovalDeliveryStatus.ts',
      'src/pages/PrivateBookingManagement/hooks/useBookingApproval.ts',
      'src/pages/PrivateBookingManagement/hooks/useBookingRequests.ts',
      'src/pages/PrivateBookingManagement/hooks/usePrivateBookingData.ts',
      'src/pages/PrivateBookingManagement/index.tsx',
      'src/pages/PrivateBookingManagement/utils/privateBookingGmReadiness.ts',
      'src/pages/PrivateBookingRequest/hooks/usePrivateBookingSubmit.ts',
      'src/pages/PrivateBookingRequest/index.tsx',
      'src/pages/PrivateBookingRequestPage.tsx',
      'src/pages/PrivateGroupCreate/index.tsx',
      'src/pages/PrivateGroupInvite/components/GroupChatSheets.tsx',
      'src/pages/PrivateGroupInvite/components/GroupInviteView.tsx',
      'src/pages/PrivateGroupManage/components/GroupChat.tsx',
      'src/pages/RentalReportForm/index.tsx',
      'src/pages/SalesManagement/components/ExternalSales.tsx',
      'src/pages/SalesManagement/components/MiscellaneousTransactions.tsx',
      'src/pages/SalesManagement/components/ProductionCostDialog.tsx',
      'src/pages/ScenarioDetailPage/components/BookingNotice.tsx',
      'src/pages/ScenarioDetailPage/components/ScenarioHero.tsx',
      'src/pages/ScenarioDetailPage/hooks/useBookingActions.ts',
      'src/pages/ScenarioManagement/components/OrganizationScenarioList.tsx',
      'src/pages/ScenarioManagement/hooks/useOrgScenariosForOptions.ts',
      'src/pages/ScenarioMasterAdmin/index.tsx',
      'src/pages/ScenarioMatcher.tsx',
      'src/pages/ScheduleManager/components/KitManagementDialog.tsx',
      'src/pages/ScheduleManager/components/kitManagement/useKitManagementData.ts',
      'src/pages/ScheduleManager/components/kitManagement/useKitManagementHandlers.ts',
      'src/pages/Settings/pages/BlogSettings.tsx',
      'src/pages/Settings/pages/BookingNoticeSettings.tsx',
      'src/pages/Settings/pages/EmailLogsSettings.tsx',
      'src/pages/Settings/pages/NotificationSettings.tsx',
      'src/pages/Settings/pages/OrganizationInfoSettings.tsx',
      'src/pages/Settings/pages/SalarySettings.tsx',
      'src/pages/Settings/pages/ShiftSettings.tsx',
      'src/pages/Settings/pages/SystemSettings.tsx',
      'src/pages/StaffManagement/components/UserSearchCombobox.tsx',
      'src/pages/StaffManagement/hooks/useStaffAuthStatus.ts',
      'src/pages/StaffManagement/hooks/useStaffInvitation.ts',
      'src/pages/StaffManagement/hooks/useStaffPerformanceCounts.ts',
      'src/pages/StaffManagement/hooks/useStoresAndScenarios.ts',
      'src/pages/StaffProfile/index.tsx',
      'src/pages/org/ContactPage.tsx',
      'src/pages/static/FAQPage.tsx',
      'src/pages/static/StoreListPage.tsx',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='from'][callee.object.name='supabase']",
          message: '画面・部品・hook から supabase.from() を直接呼ばない。src/lib/api の関数を通す（整備計画 Phase 2）。',
        },
        {
          selector: "CallExpression[callee.property.name='rpc'][callee.object.name='supabase']",
          message: '画面・部品・hook から supabase.rpc() を直接呼ばない。src/lib/api の関数を通す（整備計画 Phase 2）。',
        },
        {
          selector:
            "CallExpression[callee.property.name='update'][callee.object.callee.property.name='from'][callee.object.arguments.0.value='reservations']",
          message: "Direct update to 'reservations' is forbidden. Use RPC/API layer (e.g., reservationApi.*WithLock).",
        },
        {
          selector:
            "CallExpression[callee.property.name='delete'][callee.object.callee.property.name='from'][callee.object.arguments.0.value='reservations']",
          message: "Direct delete from 'reservations' is forbidden. Use RPC/API layer.",
        },
      ],
    },
  },
)
