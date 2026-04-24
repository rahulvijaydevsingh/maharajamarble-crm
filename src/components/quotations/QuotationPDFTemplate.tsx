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

// Convert number to words (Indian numbering)
function numberToWords(num: number): string {
  if (num === 0) return 'Zero';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five',
    'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven',
    'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty',
    'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertHundreds(n: number): string {
    if (n === 0) return '';
    if (n < 20) return ones[n] + ' ';
    if (n < 100)
      return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '') + ' ';
    return ones[Math.floor(n / 100)] + ' Hundred ' + convertHundreds(n % 100);
  }

  const crore = Math.floor(num / 10000000);
  const lakh = Math.floor((num % 10000000) / 100000);
  const thousand = Math.floor((num % 100000) / 1000);
  const rest = num % 1000;

  let result = '';
  if (crore) result += convertHundreds(crore) + 'Crore ';
  if (lakh) result += convertHundreds(lakh) + 'Lakh ';
  if (thousand) result += convertHundreds(thousand) + 'Thousand ';
  if (rest) result += convertHundreds(rest);

  return result.trim().toUpperCase();
}

export function QuotationPDFTemplate({
  quotation
}: QuotationPDFTemplateProps) {
  const items = quotation.items || [];

  // Calculate tax split
  const gstRate = quotation.gst_percentage || 0;
  const gstAmount = quotation.gst_amount || 0;
  const sgstRate = gstRate / 2;
  const cgstRate = gstRate / 2;
  const sgstAmount = gstAmount / 2;
  const cgstAmount = gstAmount / 2;
  const grandTotal = Math.round(quotation.total || 0);
  const amountInWords = numberToWords(grandTotal) + ' ONLY';

  return (
    <div
      id="quotation-print-area"
      style={{
        fontFamily: 'Arial, sans-serif',
        fontSize: '12px',
        color: '#1a1a1a',
        backgroundColor: '#fff',
        padding: '30px 36px',
        maxWidth: '800px',
        margin: '0 auto',
        lineHeight: '1.4',
      }}
    >
      {/* HEADER */}
      <div style={{
        borderBottom: '3px solid #1a1a1a',
        paddingBottom: '12px',
        marginBottom: '12px',
      }}>
        {/* Top row: GSTIN left, Phone right */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '10px',
          color: '#555',
          marginBottom: '6px',
        }}>
          <span>GSTIN: 03AMVPT8346H1ZD</span>
          <span>Phone: 7009234919</span>
        </div>

        {/* Company name centered */}
        <div style={{ textAlign: 'center', marginBottom: '4px' }}>
          <h1 style={{
            fontSize: '22px',
            fontWeight: '800',
            color: '#1a1a1a',
            margin: '0 0 2px 0',
            letterSpacing: '-0.5px',
          }}>
            MAHARAJA MARBLE & GRANITES
          </h1>
          <p style={{
            margin: '0',
            color: '#555',
            fontSize: '11px',
          }}>
            Plot No. 658, JLPL, Sector 82, Mohali, Punjab, India
          </p>
          <p style={{
            margin: '2px 0 0 0',
            color: '#555',
            fontSize: '11px',
          }}>
            Deals in: Quartz, Granite and Marble
          </p>
        </div>

        {/* Reverse charges right-aligned */}
        <div style={{ textAlign: 'right', fontSize: '10px',
                      color: '#555', marginTop: '4px' }}>
          Reverse Charges: No
        </div>
      </div>

      {/* QUOTATION TITLE + NUMBER ROW */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '14px',
        borderBottom: '1px solid #e0e0e0',
        paddingBottom: '10px',
      }}>
        <div style={{
          backgroundColor: '#1a1a1a',
          color: '#fff',
          padding: '4px 14px',
          borderRadius: '3px',
          fontSize: '11px',
          fontWeight: '600',
          letterSpacing: '1px',
        }}>
          QUOTATION
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{
            margin: '0',
            fontSize: '14px',
            fontWeight: '700',
          }}>
            {quotation.quotation_number}
          </p>
          <p style={{ margin: '3px 0 0', fontSize: '11px',
                      color: '#555' }}>
            Date: {format(
              new Date(quotation.quotation_date),
              'dd MMM yyyy'
            )}
          </p>
          {quotation.valid_until && (
            <p style={{ margin: '2px 0 0', fontSize: '10px',
                        color: '#555' }}>
              Valid until: {format(
                new Date(quotation.valid_until),
                'dd MMM yyyy'
              )}
            </p>
          )}
        </div>
      </div>

      {/* BILL TO */}
      <div style={{ marginBottom: '16px' }}>
        <p style={{
          margin: '0 0 4px',
          fontSize: '9px',
          fontWeight: '700',
          color: '#888',
          textTransform: 'uppercase',
          letterSpacing: '0.8px',
        }}>
          Bill To
        </p>
        <p style={{ margin: '0', fontSize: '14px',
                    fontWeight: '700' }}>
          {quotation.client_name}
        </p>
        {quotation.client_phone && (
          <p style={{ margin: '2px 0', color: '#555',
                      fontSize: '11px' }}>
            {quotation.client_phone}
          </p>
        )}
        {quotation.client_email && (
          <p style={{ margin: '2px 0', color: '#555',
                      fontSize: '11px' }}>
            {quotation.client_email}
          </p>
        )}
        {quotation.client_address && (
          <p style={{ margin: '2px 0', color: '#555',
                      fontSize: '11px' }}>
            {quotation.client_address}
          </p>
        )}
      </div>

      {/* LINE ITEMS TABLE */}
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        marginBottom: '20px',
        fontSize: '11px',
      }}>
        <thead>
          <tr style={{ backgroundColor: '#1a1a1a',
                       color: '#fff' }}>
            <th style={{
              padding: '8px 6px',
              textAlign: 'center',
              fontWeight: '600',
              letterSpacing: '0.5px',
              width: '5%',
            }}>
              SR.
            </th>
            <th style={{
              padding: '8px 6px',
              textAlign: 'center',
              fontWeight: '600',
              letterSpacing: '0.5px',
              width: '8%',
            }}>
              HSN/SAC
            </th>
            <th style={{
              padding: '8px 10px',
              textAlign: 'left',
              fontWeight: '600',
              letterSpacing: '0.5px',
              width: '37%',
            }}>
              ITEM / DESCRIPTION
            </th>
            <th style={{
              padding: '8px 6px',
              textAlign: 'center',
              fontWeight: '600',
              letterSpacing: '0.5px',
              width: '10%',
            }}>
              QTY
            </th>
            <th style={{
              padding: '8px 6px',
              textAlign: 'center',
              fontWeight: '600',
              letterSpacing: '0.5px',
              width: '10%',
            }}>
              UNIT
            </th>
            <th style={{
              padding: '8px 6px',
              textAlign: 'right',
              fontWeight: '600',
              letterSpacing: '0.5px',
              width: '15%',
            }}>
              RATE (₹)
            </th>
            <th style={{
              padding: '8px 10px',
              textAlign: 'right',
              fontWeight: '600',
              letterSpacing: '0.5px',
              width: '15%',
            }}>
              AMOUNT (₹)
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={item.id} style={{
              backgroundColor: index % 2 === 0
                ? '#f9f9f9' : '#fff',
            }}>
              <td style={{
                padding: '8px 6px',
                textAlign: 'center',
                borderBottom: '1px solid #e5e5e5',
              }}>
                {index + 1}
              </td>
              <td style={{
                padding: '8px 6px',
                textAlign: 'center',
                borderBottom: '1px solid #e5e5e5',
                color: '#777',
              }}>
                {(item as any).hsn_code || '6802'}
              </td>
              <td style={{
                padding: '8px 10px',
                borderBottom: '1px solid #e5e5e5',
              }}>
                <div style={{ fontWeight: '600' }}>
                  {item.item_name}
                </div>
                {item.description && (
                  <div style={{
                    fontSize: '10px',
                    color: '#777',
                    marginTop: '2px',
                  }}>
                    {item.description}
                  </div>
                )}
              </td>
              <td style={{
                padding: '8px 6px',
                textAlign: 'center',
                borderBottom: '1px solid #e5e5e5',
              }}>
                {item.quantity}
              </td>
              <td style={{
                padding: '8px 6px',
                textAlign: 'center',
                borderBottom: '1px solid #e5e5e5',
              }}>
                {item.unit}
              </td>
              <td style={{
                padding: '8px 6px',
                textAlign: 'right',
                borderBottom: '1px solid #e5e5e5',
              }}>
                {formatCurrency(item.rate)}
              </td>
              <td style={{
                padding: '8px 10px',
                textAlign: 'right',
                borderBottom: '1px solid #e5e5e5',
                fontWeight: '600',
              }}>
                {formatCurrency(item.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* TOTALS */}
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        marginBottom: '16px',
      }}>
        <div style={{ width: '260px' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '5px 0',
            borderBottom: '1px solid #e5e5e5',
          }}>
            <span style={{ color: '#555' }}>Subtotal</span>
            <span style={{ fontWeight: '600' }}>
              {formatCurrency(quotation.subtotal)}
            </span>
          </div>
          {gstRate > 0 && (
            <>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '5px 0',
                borderBottom: '1px solid #e5e5e5',
              }}>
                <span style={{ color: '#555' }}>
                  SGST ({sgstRate}%)
                </span>
                <span style={{ fontWeight: '600' }}>
                  {formatCurrency(sgstAmount)}
                </span>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '5px 0',
                borderBottom: '1px solid #e5e5e5',
              }}>
                <span style={{ color: '#555' }}>
                  CGST ({cgstRate}%)
                </span>
                <span style={{ fontWeight: '600' }}>
                  {formatCurrency(cgstAmount)}
                </span>
              </div>
            </>
          )}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '5px 0',
            borderBottom: '1px solid #e5e5e5',
          }}>
            <span style={{ color: '#555' }}>
              Freight / Cartage
            </span>
            <span style={{ fontWeight: '600' }}>
              {formatCurrency(
                (quotation as any).freight_amount || 0
              )}
            </span>
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '10px 12px',
            backgroundColor: '#1a1a1a',
            color: '#fff',
            borderRadius: '4px',
            marginTop: '4px',
          }}>
            <span style={{
              fontWeight: '700',
              fontSize: '13px',
            }}>
              GRAND TOTAL
            </span>
            <span style={{
              fontWeight: '800',
              fontSize: '13px',
            }}>
              {formatCurrency(grandTotal)}
            </span>
          </div>
        </div>
      </div>

      {/* AMOUNT IN WORDS */}
      <div style={{
        backgroundColor: '#f5f5f5',
        border: '1px solid #e0e0e0',
        borderRadius: '4px',
        padding: '8px 12px',
        marginBottom: '16px',
      }}>
        <span style={{
          fontSize: '10px',
          fontWeight: '700',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          color: '#555',
        }}>
          Amount in Words:{' '}
        </span>
        <span style={{ fontSize: '11px', fontWeight: '600' }}>
          {amountInWords}
        </span>
      </div>

      {/* NOTES */}
      {quotation.notes && (
        <div style={{
          marginBottom: '16px',
          padding: '12px',
          backgroundColor: '#f5f5f5',
          borderRadius: '4px',
          borderLeft: '3px solid #1a1a1a',
        }}>
          <p style={{
            margin: '0 0 4px',
            fontSize: '10px',
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            Notes
          </p>
          <p style={{
            margin: '0',
            color: '#444',
            whiteSpace: 'pre-wrap',
            fontSize: '11px',
          }}>
            {quotation.notes}
          </p>
        </div>
      )}

      {/* TERMS & CONDITIONS */}
      <div style={{ marginBottom: '20px' }}>
        <p style={{
          margin: '0 0 6px',
          fontSize: '10px',
          fontWeight: '700',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          color: '#1a1a1a',
        }}>
          Terms & Conditions
        </p>
        <ol style={{
          margin: '0',
          paddingLeft: '16px',
          fontSize: '10px',
          color: '#555',
          lineHeight: '1.8',
        }}>
          <li>
            All disputes subject to Chandigarh jurisdiction only.
          </li>
          <li>
            Interest @18% per annum will be charged if bills
            not paid within 15 days.
          </li>
          <li>
            Goods once sold will not be taken back.
          </li>
        </ol>
      </div>

      {/* FOOTER */}
      <div style={{
        borderTop: '2px solid #1a1a1a',
        paddingTop: '12px',
        marginTop: '8px',
      }}>
        {/* Bank details centered */}
        <div style={{
          textAlign: 'center',
          fontSize: '10px',
          color: '#555',
          marginBottom: '16px',
          fontWeight: '600',
        }}>
          Our Bank: Canara Bank |
          A/C No. 120001351990 |
          IFSC: CNRB0019620
        </div>

        {/* Signature row */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginTop: '8px',
        }}>
          <div>
            <p style={{
              margin: '0',
              fontSize: '10px',
              color: '#888',
            }}>
              Prepared by: {quotation.assigned_to}
            </p>
            <p style={{
              margin: '4px 0 0',
              fontSize: '10px',
              color: '#888',
            }}>
              Thank you for your business!
            </p>
            <div style={{
              marginTop: '24px',
              borderTop: '1px solid #aaa',
              paddingTop: '4px',
              width: '120px',
              fontSize: '10px',
              color: '#555',
              textAlign: 'center',
            }}>
              Received By
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{
              margin: '0',
              fontSize: '11px',
              fontWeight: '700',
            }}>
              Maharaja Marble & Granites
            </p>
            <div style={{
              marginTop: '24px',
              borderTop: '1px solid #aaa',
              paddingTop: '4px',
              fontSize: '10px',
              color: '#555',
              textAlign: 'center',
            }}>
              Authorised Signature
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
