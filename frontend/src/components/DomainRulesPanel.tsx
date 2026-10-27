import {
  ConstructionRounded,
  PublicRounded,
  ScheduleRounded,
} from "@mui/icons-material";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  FormControlLabel,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  COUNTRY_OPTIONS,
  type CountryOption,
  countryLabel,
} from "../lib/countries";
import {
  evaluateWindow,
  formatClockInZone,
  formatDuration,
  formatOffsetLabel,
  gmtWindow,
  isValidEnd,
  isValidStart,
  listTimezones,
  timezoneOffsetMinutes,
} from "../lib/rules";
import type {
  Domain,
  DomainRulesPayload,
  GeoMode,
  ServiceWindow,
} from "../lib/types";
import { FONT_MONO } from "../theme/theme";

const MAX_MAINTENANCE_MESSAGE = 200;
const ALL_DAY_START = "00:00";
const ALL_DAY_END = "24:00";

type WindowPreset = "all-day" | "custom";

const GEO_MODE_OPTIONS: { value: GeoMode; label: string; hint: string }[] = [
  {
    value: "all",
    label: "All countries",
    hint: "No restriction — every visitor reaches the route.",
  },
  {
    value: "allowlist",
    label: "Only selected countries",
    hint: "Visitors outside the list see a region-blocked page.",
  },
  {
    value: "blocklist",
    label: "All countries except selected",
    hint: "Everything works normally except for the listed countries.",
  },
];

function countryOptionFor(code: string): CountryOption {
  return (
    COUNTRY_OPTIONS.find((option) => option.code === code) ?? {
      code,
      name: countryLabel(code),
    }
  );
}

// Section heading: a small icon, an overline label and a sentence explaining
// what the rule does at the edge.
function RuleSection({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Paper
      variant="outlined"
      sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 3 }}
    >
      <Stack spacing={2}>
        <Box>
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: "center" }}
          >
            <Box sx={{ display: "flex", color: "text.secondary" }}>
              {icon}
            </Box>
            <Typography variant="overline" color="textSecondary">
              {title}
            </Typography>
          </Stack>
          <Typography
            variant="body2"
            color="textSecondary"
            sx={{ mt: 0.5, maxWidth: 620 }}
          >
            {description}
          </Typography>
        </Box>
        {children}
      </Stack>
    </Paper>
  );
}

// Live preview of the service window: the owner's current wall-clock time in
// the chosen timezone, the same moment in GMT, and whether the route is
// serving traffic right now. It ticks on its own so only this block rerenders
// every second.
function WindowPreview({
  timezone,
  start,
  end,
  serviceWindow,
}: {
  timezone: string;
  start: string;
  end: string;
  serviceWindow: ServiceWindow | null;
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const isAllDay = start === ALL_DAY_START && end === ALL_DAY_END;
  const offsetMinutes = timezoneOffsetMinutes(timezone, now);
  const gmt = useMemo(
    () => gmtWindow(start, end, timezone, now),
    [start, end, timezone, now],
  );
  const state = useMemo(
    () => evaluateWindow(start, end, timezone, now),
    [start, end, timezone, now],
  );

  // The server publishes the authoritative conversion; it is only shown while
  // it still matches the draft, so the line never describes stale settings.
  const confirmed =
    serviceWindow &&
    serviceWindow.timezone === timezone &&
    serviceWindow.start === start &&
    serviceWindow.end === end
      ? serviceWindow
      : null;

  return (
    <Box
      sx={{
        p: 2,
        borderRadius: 3,
        border: "1px solid",
        borderColor: "divider",
        bgcolor: "action.hover",
      }}
    >
      <Stack spacing={1.25}>
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          sx={{ alignItems: "center", flexWrap: "wrap" }}
        >
          <Typography variant="overline" color="textSecondary">
            Preview
          </Typography>
          <Chip
            size="small"
            color={state.open ? "success" : "warning"}
            variant="outlined"
            label={state.open ? "Open now" : "Closed now"}
          />
        </Stack>

        <Box>
          <Typography variant="caption" color="textSecondary">
            Your current time in {timezone}
          </Typography>
          <Typography
            sx={{ fontFamily: FONT_MONO, fontWeight: 600, fontSize: "0.95rem" }}
          >
            {formatClockInZone(now, timezone)}
          </Typography>
          <Typography variant="caption" color="textSecondary">
            {formatClockInZone(now, "UTC", {
              dateStyle: "medium",
              timeStyle: "medium",
            })}{" "}
            GMT · offset {formatOffsetLabel(offsetMinutes)}
          </Typography>
        </Box>

        <Box>
          <Typography variant="caption" color="textSecondary">
            Service window
          </Typography>
          <Typography
            sx={{ fontFamily: FONT_MONO, fontWeight: 600, fontSize: "0.95rem" }}
          >
            {isAllDay
              ? "00:00 - 24:00 local (around the clock)"
              : `${start} - ${end} local · GMT ${gmt.utcStart} - ${gmt.utcEnd}`}
          </Typography>
          <Typography variant="caption" color="textSecondary">
            {isAllDay
              ? "No time restriction — the route serves traffic all day."
              : `Timezone ${timezone} (${gmt.offsetLabel}). Outside this range visitors see a not-in-service page.`}
          </Typography>
        </Box>

        {!state.open ? (
          <Alert severity="info" variant="outlined">
            Closed for another {formatDuration(state.waitMinutes)} — visitors
            get a not-in-service page until {start}.
          </Alert>
        ) : null}

        {confirmed ? (
          <Typography variant="caption" color="textSecondary">
            Confirmed by the server: GMT {confirmed.utcStart} -{" "}
            {confirmed.utcEnd} ({confirmed.offsetLabel}).
          </Typography>
        ) : null}
      </Stack>
    </Box>
  );
}

// Editor for a route's access rules: country policy, maintenance mode and the
// daily service window. The form owns a draft copy and only publishes it when
// the owner saves, so a half-finished edit never reaches the edge.
export function DomainRulesPanel({
  domain,
  isSaving,
  onSave,
}: {
  domain: Domain;
  isSaving: boolean;
  onSave: (id: number, payload: DomainRulesPayload) => Promise<boolean>;
}) {
  const savedStart = domain.serviceStart ?? ALL_DAY_START;
  const savedEnd = domain.serviceEnd ?? ALL_DAY_END;
  const savedTimezone = domain.timezone ?? "UTC";

  const [geoMode, setGeoMode] = useState<GeoMode>(domain.geoMode ?? "all");
  const [countries, setCountries] = useState<string[]>(
    () => domain.geoCountries ?? [],
  );
  const [maintenance, setMaintenance] = useState(
    () => domain.maintenance ?? false,
  );
  const [maintenanceMessage, setMaintenanceMessage] = useState(
    () => domain.maintenanceMessage ?? "",
  );
  const [serviceHours, setServiceHours] = useState(
    () => domain.serviceHours ?? false,
  );
  const [preset, setPreset] = useState<WindowPreset>(() =>
    savedStart === ALL_DAY_START && savedEnd === ALL_DAY_END
      ? "all-day"
      : "custom",
  );
  const [timezone, setTimezone] = useState(savedTimezone);
  const [start, setStart] = useState(savedStart);
  const [end, setEnd] = useState(savedEnd);
  const [error, setError] = useState("");

  const timezones = useMemo(() => listTimezones(), []);
  const selectedCountries = useMemo(
    () => countries.map(countryOptionFor),
    [countries],
  );

  const effectiveStart = preset === "all-day" ? ALL_DAY_START : start;
  const effectiveEnd = preset === "all-day" ? ALL_DAY_END : end;

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      setError("");

      if (geoMode !== "all" && countries.length === 0) {
        setError(
          "Select at least one country, or switch the country rule back to all countries.",
        );
        return;
      }

      if (serviceHours && preset === "custom") {
        if (!isValidStart(start)) {
          setError("Enter a valid start time, for example 08:30.");
          return;
        }
        if (!isValidEnd(end)) {
          setError("Enter a valid end time, for example 19:00.");
          return;
        }
        if (start === end) {
          setError(
            "Start and end times must differ. Pick “Around the clock” to serve all 24 hours.",
          );
          return;
        }
      }

      // A rejected save stays in the form and reports through the workspace
      // snackbar, so inline messages are reserved for client-side validation.
      await onSave(domain.id, {
        geoMode,
        countries,
        maintenance,
        maintenanceMessage: maintenance ? maintenanceMessage.trim() : "",
        serviceHours,
        timezone,
        start: effectiveStart,
        end: effectiveEnd,
      });
    },
    [
      countries,
      domain.id,
      effectiveEnd,
      effectiveStart,
      end,
      geoMode,
      maintenance,
      maintenanceMessage,
      onSave,
      preset,
      serviceHours,
      start,
      timezone,
    ],
  );  return (
    <>
      <Divider />
      <CardContent>
        <Typography variant="overline" color="textSecondary">
          Access rules
        </Typography>
        <Typography
          variant="body2"
          color="textSecondary"
          sx={{ mt: 0.75, mb: 2.5, maxWidth: 620 }}
        >
          Control who reaches {domain.subdomain}, pause the route, and limit it
          to a daily window. Rules are applied at the edge before any traffic
          is forwarded.
        </Typography>

        {error ? (
          <Alert severity="error" sx={{ mb: 2.5 }} role="alert">
            {error}
          </Alert>
        ) : null}

        <Box
          component="form"
          onSubmit={handleSubmit}
          sx={{ display: "grid", gap: 2.5 }}
        >
          <RuleSection
            icon={<PublicRounded fontSize="small" />}
            title="Country access"
            description="Serve every country, only a selected set, or everyone except a selected set. The visitor's country comes from the tunnel's geo header; requests without one are not judged by location."
          >
            <FormControl>
              <RadioGroup
                value={geoMode}
                onChange={(event) => setGeoMode(event.target.value as GeoMode)}
              >
                {GEO_MODE_OPTIONS.map((option) => (
                  <FormControlLabel
                    key={option.value}
                    value={option.value}
                    control={<Radio size="small" />}
                    label={
                      <Box sx={{ py: 0.25 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {option.label}
                        </Typography>
                        <Typography variant="caption" color="textSecondary">
                          {option.hint}
                        </Typography>
                      </Box>
                    }
                    sx={{ alignItems: "flex-start", mb: 0.5, ml: 0 }}
                  />
                ))}
              </RadioGroup>
            </FormControl>

            {geoMode !== "all" ? (
              <Autocomplete
                multiple
                disableCloseOnSelect
                options={COUNTRY_OPTIONS}
                value={selectedCountries}
                onChange={(_event, next) =>
                  setCountries(next.map((option) => option.code))
                }
                getOptionLabel={(option) => `${option.name} (${option.code})`}
                isOptionEqualToValue={(option, value) =>
                  option.code === value.code
                }
                filterOptions={(options, state) => {
                  const query = state.inputValue.trim().toLowerCase();
                  if (!query) {
                    return options;
                  }
                  return options.filter(
                    (option) =>
                      option.name.toLowerCase().includes(query) ||
                      option.code.toLowerCase().startsWith(query),
                  );
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={
                      geoMode === "allowlist"
                        ? "Allowed countries"
                        : "Blocked countries"
                    }
                    placeholder="Search by name or code"
                    helperText={
                      geoMode === "allowlist"
                        ? "Only visitors from these countries can reach the route."
                        : "Visitors from these countries see a region-blocked page."
                    }
                  />
                )}
              />
            ) : null}
          </RuleSection>

          <RuleSection
            icon={<ConstructionRounded fontSize="small" />}
            title="Maintenance mode"
            description="Pause the route while you work on it. Public traffic gets a “currently not in service” page with your message, and the destination keeps running untouched."
          >
            <FormControlLabel
              control={
                <Switch
                  checked={maintenance}
                  onChange={(event) => setMaintenance(event.target.checked)}
                />
              }
              label={
                maintenance
                  ? "Maintenance mode is on"
                  : "Maintenance mode is off"
              }
            />

            {maintenance ? (
              <Stack spacing={1.5}>
                <Alert severity="warning" variant="outlined">
                  Visitors to {domain.subdomain} see a 503 page until you turn
                  this off. Maintenance overrides the country rule and the
                  service window.
                </Alert>
                <TextField
                  label="Message for visitors"
                  fullWidth
                  multiline
                  minRows={2}
                  value={maintenanceMessage}
                  onChange={(event) =>
                    setMaintenanceMessage(event.target.value)
                  }
                  placeholder="Back in about an hour — thanks for your patience."
                  helperText={
                    `Optional. ${maintenanceMessage.length}` +
                    `/${MAX_MAINTENANCE_MESSAGE} characters.`
                  }
                  slotProps={{
                    htmlInput: {
                      maxLength: MAX_MAINTENANCE_MESSAGE,
                      dir: "auto",
                    },
                  }}
                />
              </Stack>
            ) : null}
          </RuleSection>

          <RuleSection
            icon={<ScheduleRounded fontSize="small" />}
            title="Service hours"
            description="Serve the route only during a daily window in the timezone you pick. The server converts the window to GMT for the edge, and the preview below shows your current time next to it."
          >
            <FormControlLabel
              control={
                <Switch
                  checked={serviceHours}
                  onChange={(event) => setServiceHours(event.target.checked)}
                />
              }
              label={
                serviceHours
                  ? "Service hours are on"
                  : "Service hours are off (route always available)"
              }
            />

            {serviceHours ? (
              <Stack spacing={2}>
                <FormControl>
                  <RadioGroup
                    row
                    value={preset}
                    onChange={(event) =>
                      setPreset(event.target.value as WindowPreset)
                    }
                  >
                    <FormControlLabel
                      value="all-day"
                      control={<Radio size="small" />}
                      label="Around the clock (24h)"
                    />
                    <FormControlLabel
                      value="custom"
                      control={<Radio size="small" />}
                      label="Custom hours"
                    />
                  </RadioGroup>
                </FormControl>

                {preset === "custom" ? (
                  <Box
                    sx={{
                      display: "grid",
                      gap: 2,
                      gridTemplateColumns: {
                        xs: "1fr",
                        sm: "repeat(2, minmax(0, 1fr))",
                      },
                    }}
                  >
                    <TextField
                      label="Opens at"
                      type="time"
                      value={start}
                      onChange={(event) => setStart(event.target.value)}
                      slotProps={{ inputLabel: { shrink: true } }}
                      helperText="Local time in the selected timezone."
                    />
                    <TextField
                      label="Closes at"
                      type="time"
                      value={end}
                      onChange={(event) => setEnd(event.target.value)}
                      slotProps={{ inputLabel: { shrink: true } }}
                      helperText="Use 00:00 to run until midnight."
                    />
                  </Box>
                ) : null}

                <Autocomplete
                  options={timezones}
                  value={timezone}
                  onChange={(_event, next) => {
                    if (next) {
                      setTimezone(next);
                    }
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Time zone"
                      helperText="IANA timezone used to evaluate the window, including daylight saving."
                    />
                  )}
                />

                <WindowPreview
                  timezone={timezone}
                  start={effectiveStart}
                  end={effectiveEnd}
                  serviceWindow={domain.serviceWindow ?? null}
                />
              </Stack>
            ) : null}
          </RuleSection>

          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            sx={{ justifyContent: "flex-end" }}
          >
            <Button
              type="submit"
              variant="contained"
              disabled={isSaving}
              startIcon={
                isSaving ? (
                  <CircularProgress size={16} color="inherit" />
                ) : undefined
              }
            >
              Save rules
            </Button>
          </Stack>
        </Box>
      </CardContent>
    </>
  );
}
