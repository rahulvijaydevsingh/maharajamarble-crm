import React from 'react';
import { Quotation } from '@/types/quotation';
import { format } from 'date-fns';

interface QuotationPDFTemplateProps {
  quotation: Quotation;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);

export function QuotationPDFTemplate({ quotation }: QuotationPDFTemplateProps) {
  const items = quotation.items || [];

  return (
    <div
      id="quotation-print-area"
      style={{
        fontFamily: 'Arial, sans-serif',
        fontSize: '13px',
        color: '#1a1a1a',
        backgroundColor: '#fff',
        padding: '40px',
        maxWidth: '800px',
        margin: '0 auto',
        lineHeight: '1.5',
      }}
    >
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between',
                    alignItems: 'flex-start', marginBottom: '32px',
                    borderBottom: '3px solid #1a1a1a', paddingBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: '800',
                       color: '#1a1a1a', margin: '0 0 4px 0',
                       letterSpacing: '-0.5px' }}>
            MAHARAJA MARBLE & GRANITES
          </h1>
          <p style={{ margin: '0', color: '#555', fontSize: '12px' }}>
            Plot No. 658, JLPL, Sector 82, Mohali, Punjab, India
          </p>
          <p style={{ margin: '2px 0 0', color: '#555', fontSize: '12px' }}>
            Premium Natural Stone Supplier
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ backgroundColor: '#1a1a1a', color: '#fff',
                        padding: '6px 16px', borderRadius: '4px',
                        fontSize: '11px', fontWeight: '600',
                        letterSpacing: '1px', marginBottom: '8px' }}>
            QUOTATION
          </div>
          <p style={{ margin: '0', fontSize: '13px', fontWeight: '700' }}>
            {quotation.quotation_number}
          </p>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#555' }}>
            Date: {format(new Date(quotation.quotation_date), 'dd MMM yyyy')}
          </p>
          {quotation.valid_until && (
            <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#555' }}>
              Valid Until: {format(new Date(quotation.valid_until), 'dd MMM yyyy')}
            </p>
          )}
        </div>
      </div>

      {/* CLIENT INFO */}
      <div style={{ marginBottom: '28px' }}>
        <p style={{ margin: '0 0 6px', fontSize: '11px', fontWeight: '700',
                    color: '#888', textTransform: 'uppercase',
                    letterSpacing: '0.8px' }}>
          Bill To
        </p>
        <p style={{ margin: '0', fontSize: '15px', fontWeight: '700' }}>
          {quotation.client_name}
        </p>
        {quotation.client_phone && (
          <p style={{ margin: '2px 0 0', color: '#555' }}>
            {quotation.client_phone}
          </p>
        )}
        {quotation.client_email && (
          <p style={{ margin: '2px 0 0', color: '#555' }}>
            {quotation.client_email}
          </p>
        )}
        {quotation.client_address && (
          <p style={{ margin: '2px 0 0', color: '#555' }}>
            {quotation.client_address}
          </p>
        )}
      </div>

      {/* LINE ITEMS TABLE */}
      <table style={{ width: '100%', borderCollapse: 'collapse',
                      marginBottom: '24px' }}>
        <thead>
          <tr style={{ backgroundColor: '#1a1a1a', color: '#fff' }}>
            <th style={{ padding: '10px 12px', textAlign: 'left',
                         fontSize: '11px', fontWeight: '600',
                         letterSpacing: '0.5px', width: '40%' }}>
              ITEM / DESCRIPTION
            </th>
            <th style={{ padding: '10px 12px', textAlign: 'center',
                         fontSize: '11px', fontWeight: '600',
                         letterSpacing: '0.5px' }}>
              QTY
            </th>
            <th style={{ padding: '10px 12px', textAlign: 'center',
                         fontSize: '11px', fontWeight: '600',
                         letterSpacing: '0.5px' }}>
              UNIT
            </th>
            <th style={{ padding: '10px 12px', textAlign: 'right',
                         fontSize: '11px', fontWeight: '600',
                         letterSpacing: '0.5px' }}>
              RATE
            </th>
            <th style={{ padding: '10px 12px', textAlign: 'right',
                         fontSize: '11px', fontWeight: '600',
                         letterSpacing: '0.5px' }}>
              AMOUNT
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={item.id}
              style={{ backgroundColor: index % 2 === 0 ? '#f9f9f9' : '#fff' }}>
              <td style={{ padding: '10px 12px', borderBottom: '1px solid #e5e5e5' }}>
                <div style={{ fontWeight: '600' }}>{item.item_name}</div>
                {item.description && (
                  <div style={{ fontSize: '11px', color: '#777', marginTop: '2px' }}>
                    {item.description}
                  </div>
                )}
              </td>
              <td style={{ padding: '10px 12px', textAlign: 'center',
                           borderBottom: '1px solid #e5e5e5' }}>
                {item.quantity}
              </td>
              <td style={{ padding: '10px 12px', textAlign: 'center',
                           borderBottom: '1px solid #e5e5e5' }}>
                {item.unit}
              </td>
              <td style={{ padding: '10px 12px', textAlign: 'right',
                           borderBottom: '1px solid #e5e5e5' }}>
                {formatCurrency(item.rate)}
              </td>
              <td style={{ padding: '10px 12px', textAlign: 'right',
                           borderBottom: '1px solid #e5e5e5', fontWeight: '600' }}>
                {formatCurrency(item.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* TOTALS */}
      <div style={{ display: 'flex', justifyContent: 'flex-end',
                    marginBottom: '28px' }}>
        <div style={{ width: '260px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between',
                        padding: '6px 0', borderBottom: '1px solid #e5e5e5' }}>
            <span style={{ color: '#555' }}>Subtotal</span>
            <span style={{ fontWeight: '600' }}>
              {formatCurrency(quotation.subtotal)}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between',
                        padding: '6px 0', borderBottom: '1px solid #e5e5e5' }}>
            <span style={{ color: '#555' }}>
              GST ({quotation.gst_percentage}%)
            </span>
            <span style={{ fontWeight: '600' }}>
              {formatCurrency(quotation.gst_amount)}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between',
                        padding: '10px 0', backgroundColor: '#1a1a1a',
                        color: '#fff', marginTop: '4px',
                        paddingLeft: '12px', paddingRight: '12px',
                        borderRadius: '4px' }}>
            <span style={{ fontWeight: '700', fontSize: '14px' }}>
              TOTAL
            </span>
            <span style={{ fontWeight: '800', fontSize: '14px' }}>
              {formatCurrency(quotation.total)}
            </span>
          </div>
        </div>
      </div>

      {/* NOTES */}
      {quotation.notes && (
        <div style={{ marginBottom: '20px', padding: '14px',
                      backgroundColor: '#f5f5f5', borderRadius: '4px',
                      borderLeft: '3px solid #1a1a1a' }}>
          <p style={{ margin: '0 0 4px', fontSize: '11px', fontWeight: '700',
                      textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Notes
          </p>
          <p style={{ margin: '0', color: '#444', whiteSpace: 'pre-wrap' }}>
            {quotation.notes}
          </p>
        </div>
      )}

      {/* FOOTER */}
      <div style={{ borderTop: '2px solid #1a1a1a', paddingTop: '16px',
                    marginTop: '20px', display: 'flex',
                    justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ margin: '0', fontSize: '11px', color: '#888' }}>
            Prepared by: {quotation.assigned_to}
          </p>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#888' }}>
            Thank you for your business!
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ margin: '0', fontSize: '11px', fontWeight: '700' }}>
            Maharaja Marble & Granites
          </p>
          <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#888' }}>
            Authorized Signature
          </p>
        </div>
      </div>
    </div>
  );
}
