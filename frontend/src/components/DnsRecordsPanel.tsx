import {
  AddRounded,
  CloseRounded,
  DeleteOutlineRounded,
  DnsRounded,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Collapse,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
  alpha,
} from "@mui/material";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import type {
  DnsRecord,
  DnsRecordType,
  RecordDomain,
  RecordsResponse,
} from "../lib/types";
import { getErrorMessage } from "../lib/utils";
import { FONT_DISPLAY, FONT_MONO } from "../theme/theme";

const RECORD_TYPES: DnsRecordType[] = ["A", "AAAA", "CNAME", "TXT"];

const TYPE_COLOR: Record<
  DnsRecordType,
  "primary" | "info" | "success" | "warning"
> = {
  A: "primary",
  AAAA: "info",
  CNAME: "success",
  TXT: "warning",
};

const VALUE_HINTS: Record<
  DnsRecordType,
  { placeholder: string; helper: string }
> = {
  A: {
    placeholder: "203.0.113.10",
    helper: "IPv4 address this name resolves to.",
  },
  AAAA: {
    placeholder: "2001:db8::1",
    helper: "IPv6 address this name resolves to.",
  },
  CNAME: {
    placeholder: "myapp.github.io",
    helper: "Another hostname this name points to.",
  },
  TXT: {
    placeholder: "v=spf1 -all",
    helper: "Verification or policy text, up to 255 characters.",
  },
};

interface FormState {
  base: string;
  name: string;
  type: DnsRecordType;
  value: string;
  ttl: string;
}

const EMPTY_FORM: FormState = {
  base: "",
  name: "",
  type: "A",
  value: "",
  ttl: "300",
};

interface DnsRecordsPanelProps {
  onFeedback: (message: string, severity: "success" | "error") => void;
}

export function DnsRecordsPanel({ onFeedback }: DnsRecordsPanelProps) {
  const [records, setRecords] = useState<DnsRecord[]>([]);
  const [domains, setDomains] = useState<RecordDomain[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const { data } = await api.get<RecordsResponse>("/records", { signal });
      if (signal?.aborted) return;
      setRecords(data.records);
      setDomains(data.domains);
      setLoadError("");
      setForm((current) =>
        current.base
          ? current
          : { ...current, base: data.domains[0]?.domain ?? "" },
      );
    } catch (error) {
      if (signal?.aborted) return;
      setLoadError(getErrorMessage(error, "We could not load your records."));
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => {
      controller.abort();
    };
  }, [load]);

  const selectedDomain = domains.find(
    (item) => item.domain === form.base,
  );
  const valueHint = VALUE_HINTS[form.type];

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      setFormError("");

      const name = form.name.trim();
      const value = form.value.trim();
      if (!form.base) {
        setFormError("Pick a domain for the record.");
        return;
      }
      if (!name) {
        setFormError("Enter a name for the record.");
        return;
      }
      if (!value) {
        setFormError("Enter a value for the record.");
        return;
      }

      setIsSubmitting(true);
      try {
        await api.post("/records", {
          base: form.base,
          name,
          type: form.type,
          value,
          ttl: Number(form.ttl) || 300,
          mode: "dns-only",
        });
        setForm({ ...EMPTY_FORM, base: form.base });
        setShowForm(false);
        await load();
        onFeedback("Record created. It resolves within a minute.", "success");
      } catch (error) {
        setFormError(getErrorMessage(error, "Could not create the record."));
      } finally {
        setIsSubmitting(false);
      }
    },
    [form, load, onFeedback],
  );

  const handleDelete = useCallback(
    async (record: DnsRecord) => {
      setDeletingId(record.id);
      try {
        await api.delete(`/records/${record.id}`);
        setRecords((current) =>
          current.filter((item) => item.id !== record.id),
        );
        onFeedback("Record deleted.", "success");
      } catch (error) {
        onFeedback(
          getErrorMessage(error, "Could not delete the record."),
          "error",
        );
      } finally {
        setDeletingId(null);
      }
    },
    [onFeedback],
  );

  return (
    <Card sx={{ mb: 4 }}>
      <CardContent>
        <Box
          sx={{
            p: { xs: 2, sm: 2.5 },
            m: { xs: -2, sm: -2.5 },
            mb: 2,
            borderRadius: "20px 20px 0 0",
            background: (theme) =>
              `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.14)}, transparent 70%)`,
          }}
        >
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            sx={{
              justifyContent: "space-between",
              alignItems: { xs: "flex-start", sm: "center" },
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Stack
                direction="row"
                spacing={1}
                sx={{ alignItems: "center", mb: 0.75 }}
              >
                <Box
                  sx={{
                    width: 34,
                    height: 34,
                    borderRadius: "12px",
                    display: "grid",
                    placeItems: "center",
                    bgcolor: "primary.main",
                    color: "primary.contrastText",
                  }}
                >
                  <DnsRounded fontSize="small" />
                </Box>
                <Typography variant="overline" color="textSecondary">
                  DNS records
                </Typography>
              </Stack>
              <Typography
                variant="h3"
                component="h2"
                sx={{ fontFamily: FONT_DISPLAY }}
              >
                Your own nameservers
              </Typography>
              <Typography
                variant="body2"
                color="textSecondary"
                sx={{ mt: 0.5, maxWidth: 640 }}
              >
                A, AAAA, CNAME and TXT records with no quota. Every record is
                DNS-only, served by your own nameservers and resolved through
                the tunnel with HTTPS.
              </Typography>
            </Box>

            <Stack
              direction="row"
              spacing={1}
              useFlexGap
              sx={{ flexWrap: "wrap", alignItems: "center" }}
            >
              <Chip
                size="small"
                variant="outlined"
                label={`${records.length} ${records.length === 1 ? "record" : "records"}`}
              />
              <Chip
                size="small"
                variant="outlined"
                label={`${domains.length} zones`}
              />
              <Button
                variant="contained"
                startIcon={showForm ? <CloseRounded /> : <AddRounded />}
                onClick={() => {
                  setShowForm((current) => !current);
                  setFormError("");
                }}
              >
                {showForm ? "Hide form" : "New record"}
              </Button>
            </Stack>
          </Stack>
        </Box>

        <Collapse in={showForm} unmountOnExit sx={{ mb: 2.5 }}>
          {formError ? (
            <Alert severity="error" sx={{ mb: 2 }} role="alert">
              {formError}
            </Alert>
          ) : null}
          <Paper
            variant="outlined"
            component="form"
            onSubmit={handleSubmit}
            sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 3, display: "grid", gap: 2 }}
          >
            <Box
              sx={{
                display: "grid",
                gap: 2,
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: "minmax(0, 2fr) minmax(0, 1fr)",
                },
              }}
            >
              <TextField
                label="Name"
                required
                fullWidth
                placeholder="my-app"
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                helperText={
                  selectedDomain
                    ? `Resolves inside .${selectedDomain.zone}. Use @ for the zone apex.`
                    : "Pick a domain below. Use @ for the zone apex."
                }
                slotProps={{
                  htmlInput: {
                    maxLength: 253,
                    autoCapitalize: "none",
                    autoCorrect: "off",
                    spellCheck: false,
                    dir: "auto",
                  },
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <Select
                          value={form.base}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              base: String(event.target.value),
                            })
                          }
                          disabled={domains.length === 0}
                          aria-label="Record base domain"
                          variant="standard"
                          disableUnderline
                          sx={{
                            color: "text.secondary",
                            fontWeight: 600,
                            ml: 1,
                            mr: -0.5,
                            maxWidth: 240,
                          }}
                        >
                          {domains.map((item) => (
                            <MenuItem key={item.domain} value={item.domain}>
                              .{item.zone}
                            </MenuItem>
                          ))}
                        </Select>
                      </InputAdornment>
                    ),
                  },
                }}
              />
              <TextField
                select
                label="Type"
                value={form.type}
                onChange={(event) =>
                  setForm({
                    ...form,
                    type: event.target.value as DnsRecordType,
                    value: "",
                  })
                }
                fullWidth
              >
                {RECORD_TYPES.map((type) => (
                  <MenuItem key={type} value={type}>
                    {type}
                  </MenuItem>
                ))}
              </TextField>
            </Box>

            <Box
              sx={{
                display: "grid",
                gap: 2,
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: "minmax(0, 3fr) minmax(0, 1fr)",
                },
              }}
            >
              <TextField
                label="Value"
                required
                fullWidth
                placeholder={valueHint.placeholder}
                value={form.value}
                onChange={(event) =>
                  setForm({ ...form, value: event.target.value })
                }
                helperText={valueHint.helper}
                slotProps={{
                  htmlInput: {
                    maxLength: 512,
                    autoCapitalize: "none",
                    autoCorrect: "off",
                    spellCheck: false,
                    dir: "auto",
                  },
                }}
              />
              <TextField
                label="TTL (seconds)"
                type="number"
                fullWidth
                value={form.ttl}
                onChange={(event) =>
                  setForm({ ...form, ttl: event.target.value })
                }
                helperText="60–86400, default 300."
                slotProps={{ htmlInput: { min: 60, max: 86400 } }}
              />
            </Box>

            <Stack
              direction="row"
              spacing={1.5}
              sx={{ justifyContent: "flex-end" }}
            >
              <Button
                color="inherit"
                onClick={() => setShowForm(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="contained"
                disabled={isSubmitting || domains.length === 0}
                startIcon={
                  isSubmitting ? (
                    <CircularProgress size={16} color="inherit" />
                  ) : undefined
                }
              >
                Create record
              </Button>
            </Stack>
          </Paper>
        </Collapse>

        {loadError ? (
          <Alert
            severity="error"
            action={
              <Button
                color="inherit"
                size="small"
                onClick={() => {
                  setIsLoading(true);
                  void load();
                }}
              >
                Try again
              </Button>
            }
          >
            {loadError}
          </Alert>
        ) : isLoading ? (
          <Box
            sx={{
              display: "grid",
              placeItems: "center",
              gap: 1.5,
              py: 5,
            }}
            aria-live="polite"
          >
            <CircularProgress size={26} />
            <Typography variant="body2" color="textSecondary">
              Loading records...
            </Typography>
          </Box>
        ) : domains.length === 0 ? (
          <Alert severity="info" variant="outlined">
            Record mode is disabled: no base domain allows DNS records right
            now.
          </Alert>
        ) : records.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 4, px: 2 }}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                mx: "auto",
                display: "grid",
                placeItems: "center",
                bgcolor: "action.hover",
              }}
            >
              <DnsRounded />
            </Box>
            <Typography variant="body2" color="textSecondary" sx={{ mt: 1.5 }}>
              No records yet — create the first one above.
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: "grid", gap: 1.25 }}>
            {records.map((record) => (
              <Paper
                key={record.id}
                variant="outlined"
                sx={{
                  p: 1.5,
                  borderRadius: 3,
                  display: "flex",
                  flexDirection: { xs: "column", sm: "row" },
                  alignItems: { xs: "flex-start", sm: "center" },
                  gap: 1.5,
                  transition: "box-shadow 120ms ease, border-color 120ms ease",
                  "&:hover": {
                    borderColor: "primary.main",
                    boxShadow: (theme) =>
                      `0 6px 24px ${alpha(theme.palette.primary.main, 0.12)}`,
                  },
                }}
              >
                <Chip
                  label={record.type}
                  size="small"
                  color={TYPE_COLOR[record.type]}
                  variant="filled"
                  sx={{ fontFamily: FONT_MONO, minWidth: 62 }}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    variant="body2"
                    sx={{
                      fontFamily: FONT_MONO,
                      fontWeight: 600,
                      overflowWrap: "anywhere",
                    }}
                    dir="auto"
                  >
                    {record.name}
                  </Typography>
                  <Typography
                    variant="body2"
                    color="textSecondary"
                    sx={{
                      fontFamily: FONT_MONO,
                      overflowWrap: "anywhere",
                    }}
                    dir="auto"
                  >
                    {record.value}
                  </Typography>
                </Box>
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{
                    alignItems: "center",
                    alignSelf: { xs: "flex-end", sm: "center" },
                  }}
                >
                  <Typography
                    variant="caption"
                    color="textSecondary"
                    sx={{ fontFamily: FONT_MONO }}
                  >
                    {record.ttl}s
                  </Typography>
                  <Tooltip title="Delete record">
                    <IconButton
                      size="small"
                      color="error"
                      aria-label={`Delete record ${record.name}`}
                      disabled={deletingId === record.id}
                      onClick={() => {
                        void handleDelete(record);
                      }}
                    >
                      {deletingId === record.id ? (
                        <CircularProgress size={16} color="error" />
                      ) : (
                        <DeleteOutlineRounded fontSize="small" />
                      )}
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Paper>
            ))}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
