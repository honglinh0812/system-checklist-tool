import React, { useEffect, useMemo, useState } from 'react';
import { apiService } from '../../services/api';
import { API_ENDPOINTS } from '../../utils/constants';
import AssessmentResultsTable from '../../components/assessment/AssessmentResultsTable';
import { useTranslation } from '../../i18n/useTranslation';

interface HistoryItem {
  id: number;
  assessment_id?: number;
  type: 'assessment' | string;
  mop_id?: number;
  user_id?: number;
  user_name?: string;
  execution_time?: string;
  execution_time_formatted?: string;
  created_at?: string;
  completed_at?: string;
  risk_assessment?: boolean;
  handover_assessment?: boolean;
  assessment_type?: 'Risk' | 'Handover' | string;
  server_count?: number;
  total_commands?: number;
  command_count?: number;
  passed_commands?: number;
  failed_commands?: number;
  success_rate?: number;
  mop_name?: string;
  mop_title?: string;
  status: string;
  duration?: number;
}

const AssessmentResultsHistory: React.FC = () => {
  const { language } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [selected, setSelected] = useState<HistoryItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await apiService.get<{ jobs: HistoryItem[] }>(API_ENDPOINTS.ASSESSMENTS.HISTORY);
      const assessments = (resp.jobs || []).map(job => ({
        ...job,
        type: 'assessment',
        mop_id: job.assessment_id,
        mop_name: job.mop_title,
        execution_time: job.created_at,
        execution_time_formatted: job.created_at ? new Date(job.created_at).toLocaleString() : '',
        risk_assessment: job.assessment_type === 'Risk',
        handover_assessment: job.assessment_type === 'Handover',
        server_count: job.server_count,
        total_commands: job.command_count,
        user_name: job.user_name
      }));
      setItems(assessments);
    } catch (e) {
      setError('Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const loadDetail = async (item: HistoryItem) => {
    setSelected(item);
    setDetail(null);
    setDetailLoading(true);
    try {
      const isRisk = !!item.risk_assessment || (item.assessment_type || '').toLowerCase().includes('risk');
      const url = isRisk
        ? API_ENDPOINTS.ASSESSMENTS.RISK_RESULTS(item.id)
        : API_ENDPOINTS.ASSESSMENTS.HANDOVER_RESULTS(item.id);
      const data = await apiService.get<any>(url);
      setDetail(data);
    } catch (e) {
      setError('Failed to load details');
    } finally {
      setDetailLoading(false);
    }
  };

  const rows = useMemo(() => items, [items]);

  const statusBadge = (status: string) => {
    const s = (status || '').toLowerCase();
    const map: Record<string, string> = {
      running: 'info',
      pending: 'secondary',
      success: 'success',
      completed: 'success',
      failed: 'danger',
      error: 'danger'
    };
    const cls = map[s] || 'secondary';
    const textVi: Record<string,string> = { running: 'Đang chạy', pending: 'Đang chờ', success: 'Thành công', completed: 'Thành công', failed: 'Thất bại', error: 'Thất bại' };
    const textEn: Record<string,string> = { running: 'Running', pending: 'Pending', success: 'Success', completed: 'Success', failed: 'Failed', error: 'Failed' };
    const label = language === 'vi' ? (textVi[s] || status) : (textEn[s] || status);
    return <span className={`badge badge-${cls}`}>{label}</span>;
  };

  const overallResult = (item: HistoryItem) => {
    if (typeof item.success_rate === 'number') {
      return item.success_rate >= 100 ? (language === 'vi' ? 'OK' : 'OK') : (language === 'vi' ? 'Not OK' : 'Not OK');
    }
    return item.status;
  };

  return (
    <div className="container-fluid py-3">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4 className="mb-0">{language === 'vi' ? 'Kết quả báo cáo' : 'Assessment results'}</h4>
        <button className="btn btn-outline-primary" onClick={fetchHistory} disabled={loading}>
          <i className="fas fa-sync-alt mr-1"></i>
          {language === 'vi' ? 'Làm mới' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="alert alert-danger">{error}</div>
      )}

      <div className="card shadow-sm">
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead className="thead-light">
                <tr>
                  <th style={{width:'18%'}}>{language === 'vi' ? 'Người thực hiện' : 'Executor'}</th>
                  <th style={{width:'22%'}}>MOP</th>
                  <th style={{width:'18%'}}>{language === 'vi' ? 'Thời gian bắt đầu' : 'Start time'}</th>
                  <th style={{width:'12%'}}>{language === 'vi' ? 'Trạng thái' : 'Status'}</th>
                  <th style={{width:'12%'}}>{language === 'vi' ? 'Kết quả' : 'Result'}</th>
                  <th style={{width:'8%'}}></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="text-center py-4">Loading...</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-4">{language === 'vi' ? 'Không có dữ liệu' : 'No data'}</td></tr>
                ) : (
                  rows.map((it) => (
                    <tr key={`${it.id}`}>
                      <td>{it.user_name || '-'}</td>
                      <td>{it.mop_name || '-'}</td>
                      <td>{it.execution_time_formatted || it.execution_time}</td>
                      <td>{statusBadge(it.status)}</td>
                      <td>
                        <span className={`badge ${overallResult(it) === 'OK' ? 'badge-success' : 'badge-danger'}`}>{overallResult(it)}</span>
                      </td>
                      <td className="text-right">
                        <button className="btn btn-sm btn-outline-primary" onClick={() => loadDetail(it)} disabled={detailLoading && selected?.id === it.id}>
                          <i className="fas fa-eye mr-1"></i>
                          {language === 'vi' ? 'Xem chi tiết' : 'View details'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selected && detail && detail.test_results && (
        <div className="card shadow-sm mt-4">
          <div className="card-header d-flex justify-content-between align-items-center">
            <h5 className="mb-0">{language === 'vi' ? 'Chi tiết báo cáo' : 'Report details'}</h5>
            <button className="btn btn-sm btn-outline-secondary" onClick={() => { setSelected(null); setDetail(null); }}>
              <i className="fas fa-times mr-1"></i>
              {language === 'vi' ? 'Đóng' : 'Close'}
            </button>
          </div>
          <div className="card-body">
            <AssessmentResultsTable results={detail.test_results.map((r: any) => ({
              server_ip: r.server_ip,
              command_name: r.title || r.command_name || 'Command',
              command_text: r.command_text || r.command || '',
              status: (r.validation_result === 'OK' || r.decision === 'APPROVED') ? 'OK' : (r.validation_result === 'Not OK' || r.decision === 'REJECTED') ? 'Not OK' : (r.skipped ? 'SKIPPED' : 'N/A'),
              output: r.output || r.actual_output || '',
              actual_output: r.actual_output,
              reference_value: r.reference_value || r.expected_output || '',
              expected_output: r.expected_output,
              comparator_method: r.comparator_method,
              skip_reason: r.skip_reason,
              skipped: r.skipped,
              validation_result: r.validation_result,
              decision: r.decision,
              title: r.title,
              command_id_ref: r.command_id_ref,
              recommendations: r.recommendations || []
            }))} />
          </div>
        </div>
      )}
    </div>
  );
};

export default AssessmentResultsHistory;


