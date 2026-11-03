import SwiftUI

struct RecallsView: View {
    let make: String
    let model: String
    let year: Int

    @State private var recalls: [NHTSAService.Recall] = []
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        List {
            Section {
                Text("Source : base publique NHTSA (rappels de sécurité). Les données concernent principalement les véhicules commercialisés en Amérique du Nord ; pour l'Europe, consultez aussi rappel.conso.gouv.fr.")
                    .font(.caption).foregroundStyle(.secondary)
                Link(destination: URL(string: "https://rappel.conso.gouv.fr/categorie/1")!) {
                    Label("Rappel Conso (France)", systemImage: "safari")
                }
            }
            if loading {
                HStack { Spacer(); ProgressView(); Spacer() }
            } else if let error {
                Text(error).foregroundStyle(.red)
            } else if recalls.isEmpty {
                ContentUnavailableView("Aucun rappel trouvé", systemImage: "checkmark.shield",
                                       description: Text("\(make) \(model) \(String(year))"))
            } else {
                ForEach(recalls) { r in
                    DisclosureGroup {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(r.Summary)
                            if let c = r.Consequence, !c.isEmpty {
                                Text("Conséquence").font(.caption.bold()).padding(.top, 4)
                                Text(c)
                            }
                            if let rem = r.Remedy, !rem.isEmpty {
                                Text("Remède").font(.caption.bold()).padding(.top, 4)
                                Text(rem)
                            }
                        }
                        .font(.callout)
                    } label: {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(r.Component.capitalized).font(.headline)
                            Text("Campagne \(r.NHTSACampaignNumber)\(r.ReportReceivedDate.map { " · \($0)" } ?? "")")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .navigationTitle("Rappels")
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        loading = true
        error = nil
        do {
            recalls = try await NHTSAService.recalls(make: make, model: model, year: year)
        } catch {
            self.error = "Impossible de récupérer les rappels : \(error.localizedDescription)"
        }
        loading = false
    }
}
